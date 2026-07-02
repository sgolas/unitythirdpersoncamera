import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Stop } from './tripMap';

/**
 * A real, working geographic map (OpenStreetMap data via CARTO tiles) with a
 * playful cartoonish treatment: saturated "toy" tiles, big rounded emoji pins
 * with number badges, and a dashed yarn-style route between stops.
 *
 * Place names are geocoded with the free Nominatim service and cached in
 * localStorage so it only looks each place up once. If nothing can be located
 * (e.g. offline), the caller falls back to the illustrated string map.
 */

const PIN_COLORS = ['#0ea5a3', '#fb7185', '#f59e0b', '#a78bfa', '#38bdf8', '#34d399'];

/** Escape user-entered text before it goes into Leaflet HTML (pins/popups),
 *  so a place named like `<img onerror=…>` can't run script. */
function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

async function geocode(label: string): Promise<{ lat: number; lng: number } | null> {
  const key = 'geo:' + label.toLowerCase().trim();
  const cached = localStorage.getItem(key);
  if (cached !== null) return cached === 'null' ? null : JSON.parse(cached);
  try {
    // Never hang forever on a flaky connection.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(label)}`,
      { headers: { Accept: 'application/json' }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    const d = await r.json();
    if (Array.isArray(d) && d[0]) {
      const v = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      localStorage.setItem(key, JSON.stringify(v));
      return v;
    }
  } catch { /* offline / blocked */ }
  localStorage.setItem(key, 'null');
  return null;
}

export function TripLeafletMap({ stops, onFallback }: { stops: Stop[]; onFallback: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let map: L.Map | null = null;
    let cancelled = false;

    (async () => {
      const pts: { stop: Stop; lat: number; lng: number }[] = [];
      for (const s of stops) {
        const g = await geocode(s.label);
        if (g) pts.push({ stop: s, ...g });
      }
      if (cancelled) return;
      if (pts.length < 1 || !ref.current) { onFallback(); return; }

      map = L.map(ref.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }).addTo(map);

      const latlngs: [number, number][] = [];
      pts.forEach((p, i) => {
        const color = PIN_COLORS[i % PIN_COLORS.length];
        const html =
          `<div class="cmap-pin" style="--c:${color}"><span>${esc(p.stop.emoji)}</span><b>${i + 1}</b></div>`;
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: 'cmap-icon', iconSize: [46, 46], iconAnchor: [23, 23] }),
        }).addTo(map!).bindPopup(`<b>${esc(p.stop.label)}</b><br>${esc(p.stop.date)}`);
        latlngs.push([p.lat, p.lng]);
      });

      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: '#0f766e', weight: 4, opacity: 0.85, dashArray: '1 12', lineCap: 'round' }).addTo(map);
        map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
      } else {
        map.setView(latlngs[0], 6);
      }
      setTimeout(() => map && map.invalidateSize(), 200);
      setLoading(false);
    })();

    return () => { cancelled = true; if (map) map.remove(); };
  }, [stops]);

  return (
    <div className="px-3 py-4">
      <div className="cmap relative">
        <div ref={ref} className="cmap-canvas" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400 z-[500]">
            Placing your pins on the map…
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-400 mt-3">
        Real map · pins geocoded from your stops · pinch to zoom, drag to pan
      </p>
    </div>
  );
}
