/**
 * Sync relay — Cloudflare Pages Function version (Workers runtime).
 *
 * Same behaviour as the Netlify function: devices POST their full record set;
 * we merge last-write-wins into Supabase `trip_sync` and return the
 * authoritative set. Password-gated per shared trip code.
 *
 * Uses Web Crypto (crypto.subtle) instead of node:crypto, since Workers has no
 * Node built-ins. Env vars (Cloudflare Pages → Settings → Environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

async function hash(code: string, pass: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}::${pass}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

export const onRequestOptions: PagesFunction = () =>
  new Response('', { headers: CORS });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return json({ error: 'Sync backend not configured' }, 500);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { tripCode, password, device, records, readOnly } = await request.json() as {
      tripCode: string; password: string; device?: string;
      records?: Array<{ entity: string; record_id: string; updated_at: string; payload: unknown }>;
      readOnly?: boolean;
    };

    if (!tripCode || !password) return json({ error: 'Missing trip code or password' }, 400);

    const pwHash = await hash(tripCode, password);

    const { data: access } = await supabase
      .from('trip_access').select('password_hash').eq('trip_code', tripCode).maybeSingle();

    if (!access) {
      // The read-only portal must never create a trip — only the app claims a code.
      if (readOnly) return json({ error: 'no-trip' }, 404);
      await supabase.from('trip_access').insert({ trip_code: tripCode, password_hash: pwHash });
    } else if (access.password_hash !== pwHash) {
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
