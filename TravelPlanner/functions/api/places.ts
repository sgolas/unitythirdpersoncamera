/**
 * Place search — Cloudflare Pages Function proxying the Google Places API
 * (New). The Google key stays server-side (GOOGLE_MAPS_KEY secret); the app
 * calls this endpoint and falls back to the free Photon geocoder if it's
 * unavailable. Rate-limited per IP since each call costs real money.
 *
 * POST { query: string, kind?: 'airport'|'train_station'|... }
 *   → { items: [{ label, lat, lng }] }
 * POST { near: { lat, lng }, keyword: string }   (nearby discovery)
 *   → { items: [{ name, address, lat, lng, rating, ratingCount }] }
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
  rating?: number;
  userRatingCount?: number;
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

/** Nearby discovery: top-rated places of a keyword around a point. */
async function searchNearby(key: string, keyword: string, lat: number, lng: number): Promise<GPlace[]> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({
      textQuery: keyword, languageCode: 'en', maxResultCount: 12,
      rankPreference: 'RELEVANCE',
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 4000 } },
    }),
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
    const body = await request.json() as {
      query?: string; kind?: string;
      near?: { lat?: number; lng?: number }; keyword?: string;
    };

    // ── Nearby discovery mode ─────────────────────────────────
    if (body.near && typeof body.near.lat === 'number' && typeof body.near.lng === 'number') {
      const kw = (body.keyword ?? 'restaurants').trim().slice(0, 40) || 'restaurants';
      const places = await searchNearby(env.GOOGLE_MAPS_KEY, kw, body.near.lat, body.near.lng);
      const items = places
        .filter(p => p.location?.latitude != null)
        .map(p => ({
          name: p.displayName?.text ?? 'Place',
          address: p.formattedAddress ?? '',
          lat: p.location!.latitude!, lng: p.location!.longitude!,
          rating: p.rating ?? null, ratingCount: p.userRatingCount ?? null,
        }))
        // Best-rated first (with a nudge for having many reviews).
        .sort((a, b) => (b.rating ?? 0) * Math.log10((b.ratingCount ?? 0) + 10)
                       - (a.rating ?? 0) * Math.log10((a.ratingCount ?? 0) + 10))
        .slice(0, 10);
      return json({ items });
    }

    // ── Text search mode (airports/stations/general) ──────────
    const { query, kind } = body;
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
