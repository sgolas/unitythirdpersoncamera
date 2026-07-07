/**
 * Live flight status — Cloudflare Pages Function proxying aviationstack.
 * The FLIGHT_API_KEY secret stays server-side. Returns 503 not-configured
 * until a key is set, and the app degrades gracefully.
 *
 * POST { flights: [{ iata: 'AC848', date: '2026-07-08' }] }  (max 4)
 *   → { statuses: [{ iata, date, status, depGate?, depTerminal?, delayMin?,
 *                    depScheduled?, depEstimated?, arrScheduled?, arrEstimated? } | null] }
 */
import { createClient } from '@supabase/supabase-js';
import { cors, clientIp, overRequestLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  FLIGHT_API_KEY?: string;
}

interface AvFlight {
  flight_date?: string;
  flight_status?: string;
  departure?: { gate?: string; terminal?: string; delay?: number; scheduled?: string; estimated?: string };
  arrival?: { gate?: string; terminal?: string; scheduled?: string; estimated?: string };
}

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (!env.FLIGHT_API_KEY) return json({ error: 'not-configured' }, 503);

  // Strict budget: the free flight-data tier is only ~100 calls a month.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    if (await overRequestLimit(supabase, clientIp(request), 10)) {
      return json({ error: 'Too many requests' }, 429);
    }
  }

  try {
    const { flights } = await request.json() as { flights?: { iata?: string; date?: string }[] };
    if (!Array.isArray(flights) || flights.length === 0) return json({ error: 'Bad request' }, 400);

    const wanted = flights.slice(0, 4)
      .map(f => ({ iata: (f.iata ?? '').replace(/\s+/g, '').toUpperCase(), date: f.date ?? '' }))
      .filter(f => /^[A-Z0-9]{2,3}\d{1,4}$/.test(f.iata));

    const statuses = await Promise.all(wanted.map(async f => {
      try {
        const r = await fetch(
          `https://api.aviationstack.com/v1/flights?access_key=${env.FLIGHT_API_KEY}&flight_iata=${f.iata}&limit=5`);
        if (!r.ok) return null;
        const d = await r.json() as { data?: AvFlight[] };
        const rows = d.data ?? [];
        const hit = rows.find(x => x.flight_date === f.date) ?? rows[0];
        if (!hit) return null;
        return {
          iata: f.iata, date: hit.flight_date ?? f.date,
          status: hit.flight_status ?? 'unknown',
          depGate: hit.departure?.gate ?? null,
          depTerminal: hit.departure?.terminal ?? null,
          delayMin: hit.departure?.delay ?? null,
          depScheduled: hit.departure?.scheduled ?? null,
          depEstimated: hit.departure?.estimated ?? null,
          arrScheduled: hit.arrival?.scheduled ?? null,
          arrEstimated: hit.arrival?.estimated ?? null,
        };
      } catch { return null; }
    }));

    return json({ statuses });
  } catch (err) {
    return json({ error: 'Status lookup failed', detail: String(err) }, 500);
  }
};
