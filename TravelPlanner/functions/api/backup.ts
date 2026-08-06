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
import type { SupabaseClient } from '@supabase/supabase-js';
import { cors, verifyAccess, clientIp, overRequestLimit, overFailLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AUTH_SALT: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
}

/** Decode a `data:` URI into its content-type and raw bytes. */
function decodeDataUri(uri: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  const mime = m[1] || 'image/jpeg';
  const isB64 = !!m[2];
  const raw = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg').toLowerCase();
  return { bytes, ext };
}

/** For a legacy public Storage URL on the (now private) bucket, mint a signed
 *  URL so the backup can still read the bytes. Non-storage URLs pass through. */
async function readableUrl(supabase: SupabaseClient, url: string): Promise<string> {
  const m = /\/storage\/v1\/object\/(?:public|sign)\/tripphotos\/([^?]+)/.exec(url);
  if (!m) return url;
  const path = decodeURIComponent(m[1]);
  const { data } = await supabase.storage.from('tripphotos').createSignedUrl(path, 300);
  return data?.signedUrl || url;
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

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

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

  // Like gh() but throws on any non-2xx so a failed step can't be mistaken for
  // success (e.g. an oversized tree/commit) — the caller's try/catch turns it
  // into a real error response instead of a false "backed up" message.
  const ghJson = async (path: string, init: RequestInit = {}) => {
    const r = await gh(path, init);
    if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}: ${(await r.text()).slice(0, 300)}`);
    return r.json() as Promise<any>;
  };

  try {
    const { tripCode, password } = await request.json() as { tripCode: string; password: string };
    if (!tripCode || !password) return json({ error: 'Missing trip code or password' }, 400);

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    const ip = clientIp(request);
    if (await overRequestLimit(supabase, ip)) return json({ error: 'Too many requests' }, 429);

    // Auth against the same trip_access table the sync relay uses (read-only: no claim).
    const access = await verifyAccess(supabase, tripCode, password, env.AUTH_SALT, false);
    if (access === 'notfound') return json({ error: 'no-trip' }, 404);
    if (access === 'wrong') {
      if (await overFailLimit(supabase, ip, tripCode)) return json({ error: 'Too many attempts' }, 429);
      return json({ error: 'Wrong trip code or password' }, 401);
    }

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
    const baseCommit = await ghJson(`/repos/${repo}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // Existing file paths (so photos already committed are never re-uploaded).
    const existing = await ghJson(`/repos/${repo}/git/trees/${baseTreeSha}?recursive=1`);
    const havePaths = new Set<string>((existing.tree ?? []).map((t: any) => t.path));

    // Upload the records JSON as a proper blob (not inline tree `content`),
    // which handles large snapshots — inline content has a tight size limit and
    // would silently fail once documents carry big PDF attachments.
    const dataBlob = await ghJson(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ encoding: 'base64', content: toBase64(new TextEncoder().encode(dataJson)) }),
    });
    const treeEntries: any[] = [{ path: `${dir}/data.json`, mode: '100644', type: 'blob', sha: dataBlob.sha }];

    // Back up photo image files that aren't already stored. New photos are
    // local-first (`data:` URIs); older ones are Storage `url`s (now private).
    let newPhotos = 0;
    for (const r of records) {
      if (r.entity !== 'photo') continue;
      const p = r.payload as any;
      let bytes: Uint8Array | null = null;
      let ext = 'jpg';

      if (typeof p?.data === 'string' && p.data.startsWith('data:')) {
        const dec = decodeDataUri(p.data);
        if (!dec) continue;
        bytes = dec.bytes; ext = dec.ext;
      } else if (typeof p?.url === 'string') {
        ext = (p.url.split('?')[0].match(/\.(jpe?g|png|webp|gif|heic)$/i)?.[1] || 'jpg').toLowerCase();
        const img = await fetch(await readableUrl(supabase, p.url));
        if (!img.ok) continue;
        bytes = new Uint8Array(await img.arrayBuffer());
      } else continue;

      const path = `${dir}/photos/${r.record_id}.${ext}`;
      if (havePaths.has(path)) continue;
      const blob = await ghJson(`/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ encoding: 'base64', content: toBase64(bytes) }),
      });
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      newPhotos++;
    }

    // Build the new tree on top of the existing one.
    const newTree = await ghJson(`/repos/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });

    // Nothing changed → don't create an empty commit.
    if (newTree.sha === baseTreeSha) {
      return json({ ok: true, changed: false, records: records.length, newPhotos: 0 });
    }

    const commit = await ghJson(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `Backup ${tripCode}: ${records.length} records${newPhotos ? `, +${newPhotos} photos` : ''}`,
        tree: newTree.sha,
        parents: [baseCommitSha],
      }),
    });

    await ghJson(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return json({ ok: true, changed: true, records: records.length, newPhotos, commit: commit.sha });
  } catch (err) {
    return json({ error: 'Backup failed', detail: String(err) }, 500);
  }
};
