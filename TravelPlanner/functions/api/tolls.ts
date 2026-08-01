/**
 * Toll-cost lookup for a driving route — Cloudflare Pages Function.
 *
 * Proxies TollGuru so the API key stays server-side and CORS isn't an issue.
 * Given the route's points (start … stops … destination) it returns the toll
 * cost for the drive and the routed distance. With `avoidTolls` it picks the
 * lowest-toll route TollGuru offers.
 *
 * POST /api/tolls  { points:[{lat,lng},…], vehicleType?, avoidTolls? }
 *   → { toll: 24.6, currency:'EUR', distanceKm: 512.3, source:'tollguru' }
 *   → { error:'no-key' }   when TOLLGURU_API_KEY isn't set (feature just stays off)
 *
 * Env: TOLLGURU_API_KEY — get a free key at tollguru.com.
 */
import { cors } from './_shared';

interface Env { TOLLGURU_API_KEY?: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (!env.TOLLGURU_API_KEY) return json({ error: 'no-key' }, 503);

  let body: { points?: { lat: number; lng: number }[]; vehicleType?: string; avoidTolls?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'bad-request' }, 400); }

  const pts = (body.points || []).filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (pts.length < 2) return json({ error: 'need-2-points' }, 400);

  const from = pts[0], to = pts[pts.length - 1];
  const waypoints = pts.slice(1, -1);

  const payload: any = {
    from: { lat: from.lat, lng: from.lng },
    to: { lat: to.lat, lng: to.lng },
    ...(waypoints.length ? { waypoints: waypoints.map(w => ({ lat: w.lat, lng: w.lng })) } : {}),
    serviceProvider: 'here',
    vehicle: { type: body.vehicleType || '2AxlesAuto' },
    departure_time: new Date().toISOString(),
  };
  if (body.avoidTolls) payload.avoidTollRoads = true; // honored where the provider supports it

  let data: any;
  try {
    const r = await fetch('https://apis.tollguru.com/toll/v2/origin-destination-waypoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.TOLLGURU_API_KEY },
      body: JSON.stringify(payload),
    });
    data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: 'upstream', detail: data?.message || `HTTP ${r.status}` }, 502);
  } catch {
    return json({ error: 'unreachable' }, 502);
  }

  // TollGuru may return a single `route` or a `routes` array.
  const routes: any[] = Array.isArray(data?.routes) ? data.routes : data?.route ? [data.route] : [];
  if (!routes.length) return json({ error: 'no-route', detail: data?.message }, 502);

  const tollOf = (rt: any): number => {
    const c = rt?.costs || {};
    for (const k of ['cash', 'tag', 'minimumTollCost', 'licensePlate', 'prepaidCard']) {
      const raw = c[k];
      const v = typeof raw === 'number' ? raw : (typeof raw?.value === 'number' ? raw.value : undefined);
      if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
    }
    return 0;
  };
  const distOf = (rt: any): number | null => {
    const d = rt?.summary?.distance;
    if (!d) return null;
    if (typeof d.value === 'number') return d.value / 1000;      // metres → km
    const m = String(d.metric || d.text || '').match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  };
  const curOf = (rt: any): string =>
    rt?.costs?.currency || rt?.summary?.currency || data?.summary?.currency || 'USD';

  // Avoiding tolls: choose the cheapest-toll route; otherwise the first (fastest).
  const chosen = body.avoidTolls
    ? routes.slice().sort((a, b) => tollOf(a) - tollOf(b))[0]
    : routes[0];

  return json({
    toll: tollOf(chosen),
    currency: curOf(chosen),
    distanceKm: distOf(chosen),
    source: 'tollguru',
  });
};
