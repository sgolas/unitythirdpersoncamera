/**
 * Local fuel-price lookup — Cloudflare Pages Function.
 *
 * Some national fuel-price feeds are free and open but can't be called from the
 * app's WebView because they don't send CORS headers (e.g. Italy's Osservaprezzi
 * returns 403 on the pre-flight). This function proxies them server-side, where
 * CORS doesn't apply and API keys can stay secret, and returns a single tidy
 * number the app can use.
 *
 * GET /api/fuel?country=IT&lat=45.46&lng=9.19&fuel=petrol
 *   → { pricePerLiter: 1.899, currency: 'EUR', source: 'IT live' }
 *   → { error: 'no-live' }   when no live source covers that country
 *
 * Coverage: IT (Osservaprezzi), FR (data.economie.gouv.fr), DE (Tankerkönig —
 * only when the TANKERKOENIG_KEY secret is set). Everywhere else the app uses
 * its built-in editable average, so this just answers `no-live`.
 */
import { cors } from './_shared';

interface Env { TANKERKOENIG_KEY?: string }

type Fuel = 'petrol' | 'diesel' | 'lpg';
const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  const u = new URL(request.url);
  const country = (u.searchParams.get('country') || '').toUpperCase();
  const lat = parseFloat(u.searchParams.get('lat') || '');
  const lng = parseFloat(u.searchParams.get('lng') || '');
  const fuel = (u.searchParams.get('fuel') || 'petrol') as Fuel;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'bad-coords' }, 400);

  try {
    let price: number | null = null;
    let currency = 'EUR';
    if (country === 'IT') { price = await italy(lat, lng, fuel); }
    else if (country === 'FR') { price = await france(lat, lng, fuel); }
    else if (country === 'DE' && env.TANKERKOENIG_KEY) { price = await germany(lat, lng, fuel, env.TANKERKOENIG_KEY); }

    if (price != null && price > 0) return json({ pricePerLiter: Math.round(price * 1000) / 1000, currency, source: `${country} live` });
    return json({ error: 'no-live' }, 404);
  } catch (err) {
    return json({ error: 'lookup-failed', detail: String(err) }, 502);
  }
};

/* ── Italy — Osservaprezzi Carburanti (MIMIT) ──────────────────────── */
async function italy(lat: number, lng: number, fuel: Fuel): Promise<number | null> {
  const r = await fetch('https://carburanti.mise.gov.it/ospzApi/search/zone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ points: [{ lat, lng }], radius: 10, fuelType: '1-x', priceOrder: 'asc' }),
  });
  if (!r.ok) throw new Error(`IT ${r.status}`);
  const d = await r.json() as { results?: { fuels?: { price: number; name: string; fuelId: number; isSelf: boolean }[] }[] };
  const match = (f: { name: string; fuelId: number }) =>
    fuel === 'petrol' ? f.fuelId === 1 : fuel === 'diesel' ? f.fuelId === 2 : /gpl/i.test(f.name);
  const all: number[] = [], self: number[] = [];
  for (const st of d.results ?? []) for (const f of st.fuels ?? []) {
    if (match(f) && f.price > 0) { all.push(f.price); if (f.isSelf) self.push(f.price); }
  }
  const pool = self.length ? self : all;
  return pool.length ? median(pool) : null;
}

/* ── France — national instant feed (data.economie.gouv.fr) ────────── */
async function france(lat: number, lng: number, fuel: Fuel): Promise<number | null> {
  const col = fuel === 'diesel' ? 'gazole_prix' : fuel === 'lpg' ? 'gplc_prix' : 'sp95_prix';
  const url = 'https://data.economie.gouv.fr/api/records/1.0/search/'
    + '?dataset=prix-des-carburants-en-france-flux-instantane-v2'
    + `&geofilter.distance=${lat},${lng},25000&rows=40`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FR ${r.status}`);
  const d = await r.json() as { records?: { fields?: Record<string, unknown> }[] };
  const vals: number[] = [];
  for (const rec of d.records ?? []) {
    const raw = rec?.fields?.[col];
    const v = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    if (!isNaN(v) && v > 0) vals.push(v > 20 ? v / 1000 : v); // some rows are €/1000L
  }
  return vals.length ? median(vals) : null;
}

/* ── Germany — Tankerkönig (needs a free API key in TANKERKOENIG_KEY) ─ */
async function germany(lat: number, lng: number, fuel: Fuel, key: string): Promise<number | null> {
  if (fuel === 'lpg') return null; // Tankerkönig has no LPG
  const type = fuel === 'diesel' ? 'diesel' : 'e5';
  const r = await fetch(`https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=8&sort=dist&type=${type}&apikey=${key}`);
  if (!r.ok) throw new Error(`DE ${r.status}`);
  const d = await r.json() as { ok?: boolean; stations?: { price?: number; isOpen?: boolean }[] };
  const vals = (d.stations ?? []).map(s => s.price).filter((p): p is number => typeof p === 'number' && p > 0);
  return vals.length ? median(vals) : null;
}
