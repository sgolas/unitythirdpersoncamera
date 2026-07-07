/**
 * Flight lookup — resolve a flight number (e.g. AC848) into its schedule so
 * the transport form can auto-fill: airline, departure/arrival airports and
 * local times. Uses aviationstack via the server-side FLIGHT_API_KEY (free
 * plan only covers ~today's flights, but a flight number's schedule is stable
 * day to day, so the times still apply to future dates).
 *
 * POST { iata: 'AC848' } → { info: { airline, from{name,iata}, to{name,iata},
 *                                    depTime, arrTime, dayOffset } | null }
 */
import { createClient } from '@supabase/supabase-js';
import { cors, clientIp, overRequestLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  FLIGHT_API_KEY?: string;
}

interface AvFlight {
  airline?: { name?: string };
  departure?: { airport?: string; iata?: string; scheduled?: string };
  arrival?: { airport?: string; iata?: string; scheduled?: string };
}

const hhmm = (iso?: string) => (iso && iso.length >= 16 ? iso.slice(11, 16) : null);
const day = (iso?: string) => (iso ? iso.slice(0, 10) : null);

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (!env.FLIGHT_API_KEY) return json({ error: 'not-configured' }, 503);

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    if (await overRequestLimit(supabase, clientIp(request), 10)) {
      return json({ error: 'Too many requests' }, 429);
    }
  }

  try {
    const { iata } = await request.json() as { iata?: string };
    const flight = (iata ?? '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flight)) return json({ error: 'Bad flight number' }, 400);

    // aviationstack's free plan only allows plain-HTTP; try HTTPS first.
    const q = `/v1/flights?access_key=${env.FLIGHT_API_KEY}&flight_iata=${flight}&limit=5`;
    let d: { data?: AvFlight[]; error?: { code?: string } };
    const r = await fetch(`https://api.aviationstack.com${q}`);
    d = await r.json() as typeof d;
    if (d.error || !r.ok) {
      const r2 = await fetch(`http://api.aviationstack.com${q}`);
      d = await r2.json() as typeof d;
      if (d.error || !r2.ok) return json({ info: null });
    }

    const hit = (d.data ?? []).find(f => f.departure?.scheduled && f.arrival?.scheduled) ?? (d.data ?? [])[0];
    if (!hit) return json({ info: null });

    const depDay = day(hit.departure?.scheduled);
    const arrDay = day(hit.arrival?.scheduled);
    const dayOffset = depDay && arrDay
      ? Math.round((new Date(arrDay).getTime() - new Date(depDay).getTime()) / 86400000) : 0;

    return json({ info: {
      airline: hit.airline?.name ?? null,
      from: { name: hit.departure?.airport ?? null, iata: hit.departure?.iata ?? null },
      to:   { name: hit.arrival?.airport ?? null,   iata: hit.arrival?.iata ?? null },
      depTime: hhmm(hit.departure?.scheduled),
      arrTime: hhmm(hit.arrival?.scheduled),
      dayOffset,
    } });
  } catch (err) {
    return json({ error: 'Lookup failed', detail: String(err) }, 500);
  }
};
