/**
 * "Places nearby" discovery — top-rated spots around a point, via our own
 * /api/places relay (Google Places, key server-side). Cached briefly per
 * location+keyword so re-opening the panel doesn't re-charge the API.
 */
import { PLACES_ENDPOINT } from './config';

export interface NearbyPlace {
  name: string; address: string; lat: number; lng: number;
  rating: number | null; ratingCount: number | null;
}

const cache = new Map<string, { at: number; items: NearbyPlace[] }>();
const TTL = 10 * 60_000;

export async function findNearby(
  lat: number, lng: number, keyword: string,
): Promise<NearbyPlace[] | 'not-configured' | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}:${keyword}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  try {
    const r = await fetch(PLACES_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ near: { lat, lng }, keyword }),
    });
    if (r.status === 503) return 'not-configured';
    if (!r.ok) return null;
    const d = await r.json() as { items?: NearbyPlace[] };
    const items = Array.isArray(d.items) ? d.items : [];
    cache.set(key, { at: Date.now(), items });
    return items;
  } catch { return null; }
}
