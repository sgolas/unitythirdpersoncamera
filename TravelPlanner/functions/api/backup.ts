/**
 * GitHub backup relay — Cloudflare Pages Function (Workers runtime).
 *
 * Commits a full snapshot of a trip (all records + photo files) into a GitHub
 * repo. Because git history is immutable, every snapshot is preserved forever:
 * deleting something in the app can never remove it from the GitHub backup.
 *
 * Auth mirrors /api/sync — the shared trip code + password. The snapshot is
 * pulled server-side from Supabase, so the caller only sends credentials.
 *
 * Env vars (Cloudflare Pages → Settings → Environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   — read the trip data + photos
 *   GITHUB_TOKEN                         — fine-grained PAT, contents:write
 *   GITHUB_REPO                          — "owner/name" to back up into
 *   GITHUB_BRANCH  (optional)            — defaults to "trip-backups"
 */
import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

async function hash(code: string, pass: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}::${pass}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Safe folder name for a trip code. */
function slug(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'trip';
}

/** base64-encode raw bytes (Workers-safe, chunked to avoid call-stack limits). */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export const onRequestOptions: PagesFunction = () => new Response('', { headers: CORS });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return json({ error: 'Sync backend not configured' }, 500);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO)
    return json({ error: 'GitHub backup not configured yet' }, 503);

  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'trip-backups';
  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'trip-planner-backup',
        ...(init.headers || {}),
      },
    });

  try {
    const { tripCode, password } = await request.json() as { tripCode: string; password: string };
    if (!tripCode || !password) return json({ error: 'Missing trip code or password' }, 400);

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    // Auth against the same trip_access table the sync relay uses.
    const { data: access } = await supabase
      .from('trip_access').select('password_hash').eq('trip_code', tripCode).maybeSingle();
    if (!access) return json({ error: 'no-trip' }, 404);
    if (access.password_hash !== await hash(tripCode, password))
      return json({ error: 'Wrong trip code or password' }, 401);

    // Pull the authoritative record set.
    const { data: rows } = await supabase
      .from('trip_sync').select('entity, record_id, updated_at, payload').eq('trip_code', tripCode);
    const records = (rows ?? []).slice().sort((a, b) =>
      (a.entity + a.record_id).localeCompare(b.entity + b.record_id));

    const dir = `trip-backups/${slug(tripCode)}`;
    // Deterministic snapshot (no volatile timestamp) so identical data → no commit.
    const dataJson = JSON.stringify({ tripCode, count: records.length, records }, null, 2);

    // ── Resolve the backup branch, creating it if needed ──────────────
    let ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`);
    if (ref.status === 404) {
      const meta = await gh(`/repos/${repo}`).then(r => r.json()) as { default_branch: string };
      const baseRef = await gh(`/repos/${repo}/git/ref/heads/${meta.default_branch}`).then(r => r.json()) as any;
      await gh(`/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }),
      });
      ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`);
    }
    const refJson = await ref.json() as any;
    const baseCommitSha = refJson.object.sha;
    const baseCommit = await gh(`/repos/${repo}/git/commits/${baseCommitSha}`).then(r => r.json()) as any;
    const baseTreeSha = baseCommit.tree.sha;

    // Existing file paths (so photos already committed are never re-uploaded).
    const existing = await gh(`/repos/${repo}/git/trees/${baseTreeSha}?recursive=1`).then(r => r.json()) as any;
    const havePaths = new Set<string>((existing.tree ?? []).map((t: any) => t.path));

    const treeEntries: any[] = [{ path: `${dir}/data.json`, mode: '100644', type: 'blob', content: dataJson }];

    // Back up photo image files that aren't already stored.
    let newPhotos = 0;
    for (const r of records) {
      if (r.entity !== 'photo') continue;
      const p = r.payload as any;
      const url: string | undefined = p?.url;
      if (!url) continue;
      const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp|gif|heic)$/i)?.[1] || 'jpg').toLowerCase();
      const path = `${dir}/photos/${r.record_id}.${ext}`;
      if (havePaths.has(path)) continue;
      const img = await fetch(url);
      if (!img.ok) continue;
      const blob = await gh(`/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ encoding: 'base64', content: toBase64(new Uint8Array(await img.arrayBuffer())) }),
      }).then(res => res.json()) as any;
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      newPhotos++;
    }

    // Build the new tree on top of the existing one.
    const newTree = await gh(`/repos/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    }).then(r => r.json()) as any;

    // Nothing changed → don't create an empty commit.
    if (newTree.sha === baseTreeSha) {
      return json({ ok: true, changed: false, records: records.length, newPhotos: 0 });
    }

    const commit = await gh(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `Backup ${tripCode}: ${records.length} records${newPhotos ? `, +${newPhotos} photos` : ''}`,
        tree: newTree.sha,
        parents: [baseCommitSha],
      }),
    }).then(r => r.json()) as any;

    await gh(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return json({ ok: true, changed: true, records: records.length, newPhotos, commit: commit.sha });
  } catch (err) {
    return json({ error: 'Backup failed', detail: String(err) }, 500);
  }
};
