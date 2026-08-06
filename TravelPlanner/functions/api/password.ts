/**
 * Change the shared password for a trip code.
 *
 * The sync relay authenticates every request against the ORIGINAL password a
 * trip code was claimed with, and had no way to rotate it — so changing the
 * password in the app used to silently break sync (the server kept rejecting
 * the new password). This endpoint closes that gap: prove you know the current
 * password, and it updates the stored hash to a new one for everyone.
 *
 * Env (Cloudflare Pages → Settings → Environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, AUTH_SALT
 */
import { createClient } from '@supabase/supabase-js';
import { cors, authHash, verifyAccess, clientIp, overRequestLimit, overFailLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AUTH_SALT: string;
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

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const ip = clientIp(request);
  if (await overRequestLimit(supabase, ip)) return json({ error: 'Too many requests' }, 429);

  let body: { tripCode?: string; password?: string; newPassword?: string };
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const { tripCode, password, newPassword } = body;

  if (!tripCode || !password || !newPassword)
    return json({ error: 'Missing trip code, current password or new password' }, 400);
  if (newPassword.length < 6)
    return json({ error: 'New password must be at least 6 characters' }, 400);
  if (newPassword === password)
    return json({ error: 'New password is the same as the current one' }, 400);

  // Authenticate with the CURRENT password (allowClaim=false: never create a
  // code here — you can only change the password of a trip that already exists).
  const access = await verifyAccess(supabase, tripCode, password, env.AUTH_SALT, false);
  if (access === 'notfound') return json({ error: 'no-trip' }, 404);
  if (access === 'wrong') {
    if (await overFailLimit(supabase, ip, tripCode)) return json({ error: 'Too many attempts' }, 429);
    return json({ error: 'Wrong trip code or password' }, 401);
  }

  // Rotate the stored hash to the new password. From now on every device must
  // use the new password (this device updates itself; others re-enter it once).
  const nextHash = await authHash(tripCode, newPassword, env.AUTH_SALT);
  const { error } = await supabase.from('trip_access')
    .update({ password_hash: nextHash }).eq('trip_code', tripCode);
  if (error) return json({ error: 'Could not update password' }, 500);

  return json({ ok: true });
};
