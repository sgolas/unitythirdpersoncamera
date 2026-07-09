/**
 * Register (or refresh) a device's FCM push token for a trip.
 *
 * The app calls this after the user grants notification permission. We verify
 * the trip code + password (same gate as sync) so only real family members can
 * register, then upsert the token keyed by (trip_code, device_id) — re-running
 * it just refreshes a rotated token.
 *
 * POST { tripCode, password, deviceId, token }  → { ok: true }
 * POST { tripCode, password, deviceId, token: '' } removes the registration
 *   (used when the user revokes permission / signs out of the trip).
 */
import { createClient } from '@supabase/supabase-js';
import { cors, verifyAccess, clientIp, overRequestLimit, overFailLimit } from './_shared';

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
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not-configured' }, 500);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  const ip = clientIp(request);
  if (await overRequestLimit(supabase, ip)) return json({ error: 'Too many requests' }, 429);

  try {
    const { tripCode, password, deviceId, token } = await request.json() as {
      tripCode?: string; password?: string; deviceId?: string; token?: string;
    };
    if (!tripCode || !password || !deviceId) return json({ error: 'Bad request' }, 400);

    const access = await verifyAccess(supabase, tripCode, password, env.AUTH_SALT, false);
    if (access === 'notfound') return json({ error: 'no-trip' }, 404);
    if (access === 'wrong') {
      if (await overFailLimit(supabase, ip, tripCode)) return json({ error: 'Too many attempts' }, 429);
      return json({ error: 'Wrong trip code or password' }, 401);
    }

    if (!token) {
      await supabase.from('push_tokens').delete().eq('trip_code', tripCode).eq('device_id', deviceId);
      return json({ ok: true, removed: true });
    }

    await supabase.from('push_tokens').upsert(
      { trip_code: tripCode, device_id: deviceId, token, updated_at: new Date().toISOString() },
      { onConflict: 'trip_code,device_id' },
    );
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Register failed', detail: String(err) }, 500);
  }
};
