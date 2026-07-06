/**
 * Sync relay — Cloudflare Pages Function version (Workers runtime).
 *
 * Same behaviour as the Netlify function: devices POST their full record set;
 * we merge last-write-wins into Supabase `trip_sync` and return the
 * authoritative set. Password-gated per shared trip code.
 *
 * Auth, CORS and rate limiting live in ./_shared. Env vars (Cloudflare Pages →
 * Settings → Environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, AUTH_SALT
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
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return json({ error: 'Sync backend not configured' }, 500);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const ip = clientIp(request);
  if (await overRequestLimit(supabase, ip)) return json({ error: 'Too many requests' }, 429);

  try {
    const { tripCode, password, device, records, readOnly } = await request.json() as {
      tripCode: string; password: string; device?: string;
      records?: Array<{ entity: string; record_id: string; updated_at: string; payload: unknown }>;
      readOnly?: boolean;
    };

    if (!tripCode || !password) return json({ error: 'Missing trip code or password' }, 400);

    // The read-only portal must never create a trip — only the app claims a code.
    const access = await verifyAccess(supabase, tripCode, password, env.AUTH_SALT, !readOnly);
    if (access === 'notfound') return json({ error: 'no-trip' }, 404);
    if (access === 'wrong') {
      if (await overFailLimit(supabase, ip, tripCode)) return json({ error: 'Too many attempts' }, 429);
      return json({ error: 'Wrong trip code or password' }, 401);
    }

    let accepted = 0;
    if (!readOnly && Array.isArray(records) && records.length) {
      const { data: existing } = await supabase
        .from('trip_sync').select('entity, record_id, updated_at').eq('trip_code', tripCode);
      const stored = new Map<string, string>();
      (existing ?? []).forEach(r => stored.set(`${r.entity}:${r.record_id}`, r.updated_at));

      const winners = records.filter(r => {
        const prev = stored.get(`${r.entity}:${r.record_id}`);
        return !prev || r.updated_at > prev;
      }).map(r => ({
        trip_code: tripCode, entity: r.entity, record_id: r.record_id,
        updated_at: r.updated_at, updated_by: device ?? 'unknown', payload: r.payload,
      }));

      if (winners.length) {
        await supabase.from('trip_sync').upsert(winners, { onConflict: 'trip_code,entity,record_id' });
        accepted = winners.length;
      }
    }

    const { data: all } = await supabase
      .from('trip_sync').select('entity, record_id, updated_at, payload').eq('trip_code', tripCode);

    return json({ accepted, records: all ?? [] });
  } catch (err) {
    return json({ error: 'Sync failed', detail: String(err) }, 500);
  }
};
