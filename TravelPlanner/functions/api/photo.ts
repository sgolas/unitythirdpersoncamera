/**
 * Photo upload — Cloudflare Pages Function.
 *
 * Legacy endpoint. Photos are now stored local-first (as data: URIs synced to
 * every device), so the app no longer calls this on the happy path. It is kept
 * for backwards compatibility: it verifies the trip password, uploads the bytes
 * to the *private* `tripphotos` bucket via the service key, and returns a
 * short-lived signed URL. Auth, CORS and rate limiting live in ./_shared.
 */
import { createClient } from '@supabase/supabase-js';
import { cors, verifyAccess, clientIp, overRequestLimit, overFailLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AUTH_SALT: string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return json({ error: 'Storage not configured' }, 500);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const ip = clientIp(request);
  if (await overRequestLimit(supabase, ip)) return json({ error: 'Too many requests' }, 429);

  try {
    const { tripCode, password, filename, contentType, dataBase64 } = await request.json() as {
      tripCode: string; password: string; filename: string; contentType: string; dataBase64: string;
    };
    if (!tripCode || !password || !dataBase64) return json({ error: 'Missing fields' }, 400);

    // Same gate as sync — verify or claim the trip password.
    const access = await verifyAccess(supabase, tripCode, password, env.AUTH_SALT, true);
    if (access === 'wrong') {
      if (await overFailLimit(supabase, ip, tripCode)) return json({ error: 'Too many attempts' }, 429);
      return json({ error: 'Wrong trip code or password' }, 401);
    }

    const safeName = (filename || `photo_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${tripCode}/${Date.now()}_${safeName}`;
    const bytes = b64ToBytes(dataBase64);

    const { error: upErr } = await supabase.storage
      .from('tripphotos')
      .upload(path, bytes, { contentType: contentType || 'image/jpeg', upsert: true });
    if (upErr) return json({ error: 'Upload failed', detail: upErr.message }, 500);

    // Bucket is private — hand back a signed URL (1 year) instead of a public one.
    const { data: signed, error: signErr } = await supabase.storage
      .from('tripphotos').createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr) return json({ error: 'Sign failed', detail: signErr.message }, 500);
    return json({ url: signed.signedUrl, path });
  } catch (err) {
    return json({ error: 'Photo upload failed', detail: String(err) }, 500);
  }
};
