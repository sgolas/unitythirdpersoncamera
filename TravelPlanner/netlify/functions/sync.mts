import type { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

/**
 * Sync relay. Devices POST their full local record set; we merge with
 * last-write-wins into `trip_sync` and return the authoritative set.
 *
 * A trip is identified by a shared `tripCode`. The first device to sync a
 * given code sets its password; later devices must match it. This same
 * code+password gates the read-only web portal.
 *
 * Server env (Netlify): SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const hash = (code: string, pass: string) =>
  createHash('sha256').update(`${code}::${pass}`).digest('hex');

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Sync backend not configured' }) };

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    const { tripCode, password, device, records, readOnly } =
      JSON.parse(event.body ?? '{}') as {
        tripCode: string; password: string; device?: string;
        records?: Array<{ entity: string; record_id: string; updated_at: string; payload: unknown }>;
        readOnly?: boolean;
      };

    if (!tripCode || !password)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing trip code or password' }) };

    const pwHash = hash(tripCode, password);

    // Verify or claim the trip's password.
    const { data: access } = await supabase
      .from('trip_access').select('password_hash').eq('trip_code', tripCode).maybeSingle();

    if (!access) {
      // First device claims this trip code.
      await supabase.from('trip_access').insert({ trip_code: tripCode, password_hash: pwHash });
    } else if (access.password_hash !== pwHash) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Wrong trip code or password' }) };
    }

    // Merge incoming records (skip for read-only portal fetches).
    let accepted = 0;
    if (!readOnly && Array.isArray(records) && records.length) {
      const { data: existing } = await supabase
        .from('trip_sync').select('entity, record_id, updated_at').eq('trip_code', tripCode);
      const stored = new Map<string, string>();
      (existing ?? []).forEach(r => stored.set(`${r.entity}:${r.record_id}`, r.updated_at));

      const winners = records.filter(r => {
        const prev = stored.get(`${r.entity}:${r.record_id}`);
        return !prev || r.updated_at > prev; // last-write-wins
      }).map(r => ({
        trip_code: tripCode,
        entity: r.entity,
        record_id: r.record_id,
        updated_at: r.updated_at,
        updated_by: device ?? 'unknown',
        payload: r.payload,
      }));

      if (winners.length) {
        await supabase.from('trip_sync')
          .upsert(winners, { onConflict: 'trip_code,entity,record_id' });
        accepted = winners.length;
      }
    }

    // Return the authoritative set.
    const { data: all } = await supabase
      .from('trip_sync')
      .select('entity, record_id, updated_at, payload')
      .eq('trip_code', tripCode);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ accepted, records: all ?? [] }),
    };
  } catch (err) {
    console.error('sync error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Sync failed' }) };
  }
};
