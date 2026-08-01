/**
 * Toll-cost lookup for a driving route. Calls the /api/tolls proxy (TollGuru
 * behind it). Returns null when tolls can't be determined — no API key, offline,
 * or the provider had nothing — so the caller just shows fuel only.
 */
import { TOLLS_ENDPOINT } from './config';

export interface TollResult {
  toll: number;            // toll cost for the one-way route, in `currency`
  currency: string;
  distanceKm: number | null; // the routed distance (respects "avoid tolls")
  source: string;
}

export async function fetchTolls(
  points: { lat: number; lng: number }[],
  opts: { vehicleType?: string; avoidTolls?: boolean } = {},
): Promise<TollResult | null> {
  const pts = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(TOLLS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        points: pts.map(p => ({ lat: p.lat, lng: p.lng })),
        avoidTolls: !!opts.avoidTolls,
        vehicleType: opts.vehicleType,
      }),
    });
    clearTimeout(t);
    if (!r.ok) return null;                       // no key / upstream error
    const j = await r.json() as Partial<TollResult>;
    if (typeof j?.toll !== 'number') return null;
    return {
      toll: Math.max(0, j.toll),
      currency: j.currency || 'USD',
      distanceKm: typeof j.distanceKm === 'number' ? j.distanceKm : null,
      source: j.source || 'tollguru',
    };
  } catch {
    return null;
  }
}
