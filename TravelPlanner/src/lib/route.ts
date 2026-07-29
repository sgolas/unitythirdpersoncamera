/**
 * On-device route planning — no servers, no API cost.
 *
 * Given a set of places (and optionally a start point), work out a good order
 * to visit them in (shortest total distance), and build a Google Maps
 * directions link that opens the whole day as turn-by-turn navigation.
 */

export interface RoutePoint { label: string; lat: number; lng: number }

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two points, in km. */
export function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total length of a path visiting the points in order. */
export function pathLengthKm(points: RoutePoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distanceKm(points[i - 1], points[i]);
  return d;
}

/** Roads wind ~30% longer than the straight line — used for the offline estimate. */
const WINDING = 1.3;

export interface RoadDistance { km: number; source: 'road' | 'estimate' }

/**
 * Driving distance through the points in order. Asks the public OSRM road
 * router for the real distance along roads; if that's unreachable (offline, or
 * blocked) it falls back to great-circle distance inflated by a winding factor,
 * so a number always comes back. Never throws.
 */
export async function roadDistanceKm(points: RoutePoint[]): Promise<RoadDistance> {
  const estimate: RoadDistance = { km: pathLengthKm(points) * WINDING, source: 'estimate' };
  if (points.length < 2) return { km: 0, source: 'road' };
  try {
    const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    const meters = j?.routes?.[0]?.distance;
    if (typeof meters === 'number' && meters > 0) return { km: meters / 1000, source: 'road' };
  } catch { /* fall back to the estimate */ }
  return estimate;
}

/**
 * Order the places for the shortest trip. If `start` is given (e.g. your
 * current location) the route begins there and that point is kept first;
 * otherwise the first place is used as the anchor. Uses nearest-neighbour to
 * seed, then 2-opt to untangle crossings — plenty for a day's worth of stops.
 */
export function optimizeRoute(places: RoutePoint[], start?: RoutePoint | null): RoutePoint[] {
  const pts = [...places];
  if (pts.length <= 2) return start ? [start, ...pts] : pts;

  // Nearest-neighbour seed.
  const anchor = start ?? pts.shift()!;
  const order: RoutePoint[] = [anchor];
  const remaining = start ? pts : [...pts];
  while (remaining.length) {
    const last = order[order.length - 1];
    let bi = 0, bd = Infinity;
    remaining.forEach((p, i) => { const d = distanceKm(last, p); if (d < bd) { bd = d; bi = i; } });
    order.push(remaining.splice(bi, 1)[0]);
  }

  // 2-opt: repeatedly reverse a segment if it shortens the path. Keep index 0
  // (the start) fixed.
  const lockStart = start ? 1 : 0;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = lockStart; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const before = distanceKm(order[i - 1] ?? order[i], order[i]) + distanceKm(order[k], order[k + 1] ?? order[k]);
        const after = distanceKm(order[i - 1] ?? order[i], order[k]) + distanceKm(order[i], order[k + 1] ?? order[k]);
        if (after + 1e-9 < before) {
          const seg = order.slice(i, k + 1).reverse();
          order.splice(i, seg.length, ...seg);
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * A Google Maps directions link through the points in order. Opens the Google
 * Maps app on a phone, or maps.google.com in a browser. Google allows up to
 * ~10 points per link, so we trim from the middle if there are more.
 */
export function googleMapsDirections(points: RoutePoint[], mode: 'walking' | 'driving' | 'transit' = 'driving'): string {
  const pick = points.length > 10
    ? [points[0], ...points.slice(1, -1).filter((_, i) => i % Math.ceil((points.length - 2) / 8) === 0).slice(0, 8), points[points.length - 1]]
    : points;
  const coord = (p: RoutePoint) => `${p.lat},${p.lng}`;
  const params = new URLSearchParams({ api: '1', travelmode: mode });
  params.set('origin', coord(pick[0]));
  params.set('destination', coord(pick[pick.length - 1]));
  if (pick.length > 2) params.set('waypoints', pick.slice(1, -1).map(coord).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A single-place Google Maps link (search/point). */
export function googleMapsPlace(p: RoutePoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.lat},${p.lng}`)}`;
}
