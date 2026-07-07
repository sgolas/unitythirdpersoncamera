/**
 * Place search — Cloudflare Pages Function proxying the Google Places API
 * (New). The Google key stays server-side (GOOGLE_MAPS_KEY secret); the app
 * calls this endpoint and falls back to the free Photon geocoder if it's
 * unavailable. Rate-limited per IP since each call costs real money.
 *
 * POST { query: string, kind?: 'airport'|'train_station'|'bus_station'|
 *        'ferry_terminal'|'hub'|'any' }
 *   → { items: [{ label, lat, lng }] }
 * 'hub' searches airports + train stations together (car/transfer modes).
 */
import { createClient } from '@supabase/supabase-js';
import { cors, clientIp, overRequestLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  GOOGLE_MAPS_KEY: string;
}

/** Search keywords per kind ('' = plain query). Keyword text steers Google
 *  far better than `includedType`, which misses e.g. `international_airport`. */
const KINDS: Record<string, string[]> = {
  airport: ['airport'],
  train_station: ['train station'],
  bus_station: ['bus station'],
  ferry_terminal: ['ferry terminal'],
  hub: ['airport', 'train station'],
  any: [''],
};

interface GPlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

async function searchGoogle(key: string, query: string, keyword: string): Promise<GPlace[]> {
  const textQuery = keyword && !query.toLowerCase().includes(keyword.split(' ').pop()!)
    ? `${query} ${keyword}` : query;
  const body: Record<string, unknown> = { textQuery, languageCode: 'en', maxResultCount: 6 };
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`google ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json() as { places?: GPlace[] };
  return d.places ?? [];
}

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (!env.GOOGLE_MAPS_KEY) return json({ error: 'not-configured' }, 503);

  // Stricter budget than sync — every request here costs money.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    if (await overRequestLimit(supabase, clientIp(request), 30)) {
      return json({ error: 'Too many requests' }, 429);
    }
  }

  try {
    const { query, kind } = await request.json() as { query?: string; kind?: string };
    const q = (query ?? '').trim();
    if (q.length < 3 || q.length > 100) return json({ error: 'Bad query' }, 400);
    const types = KINDS[kind ?? 'any'] ?? KINDS.any;

    const errors: string[] = [];
    const results = await Promise.all(types.map(t =>
      searchGoogle(env.GOOGLE_MAPS_KEY, q, t).catch(e => { errors.push(String(e)); return [] as GPlace[]; })
    ));
    const seen = new Set<string>();
    const items = results.flat()
      .map(p => ({
        label: [p.displayName?.text, p.formattedAddress].filter(Boolean).join(', '),
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      }))
      .filter(i => i.label && !seen.has(i.label) && seen.add(i.label))
      .slice(0, 8);

    if (items.length === 0 && errors.length) return json({ items, detail: errors[0] });
    return json({ items });
  } catch (err) {
    return json({ error: 'Search failed', detail: String(err) }, 500);
  }
};
