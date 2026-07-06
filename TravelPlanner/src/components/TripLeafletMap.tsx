import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Stop } from './tripMap';
import type { MapPin } from '../types';
import type { LatLng } from '../lib/geo';

/**
 * A real, working geographic map (OpenStreetMap data via CARTO tiles) with a
 * playful cartoonish treatment: saturated "toy" tiles, big rounded emoji pins
 * with number badges, and a dashed yarn-style route between stops.
 *
 * On top of the trip route it also shows:
 *   • the user's current location (a pulsing "you are here" dot), and
 *   • custom pins the user has dropped, tappable to view/edit.
 * Tapping empty map calls `onMapTap` so the caller can drop a new pin there.
 *
 * Place names are geocoded with the free Nominatim service and cached in
 * localStorage so it only looks each place up once. If nothing can be located
 * (e.g. offline) and there are no pins or location, the caller falls back to
 * the illustrated string map.
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

interface Props {
  stops: Stop[];
  onFallback: () => void;
  pins?: MapPin[];
  me?: LatLng | null;
  onMapTap?: (lat: number, lng: number) => void;
  onPinTap?: (pin: MapPin) => void;
}

export function TripLeafletMap({ stops, onFallback, pins = [], me = null, onMapTap, onPinTap }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stopLayer = useRef<L.LayerGroup | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const stopPts = useRef<[number, number][]>([]);
  const lastFitSig = useRef('');
  const firedFallback = useRef(false);
  const [loading, setLoading] = useState(true);

  // Keep the latest callbacks reachable from Leaflet event handlers.
  const tapRef = useRef(onMapTap); tapRef.current = onMapTap;
  const pinTapRef = useRef(onPinTap); pinTapRef.current = onPinTap;

  /** Fit the view to everything we know about — but only when that set of
   *  points actually changes, so we never yank the map while the user pans. */
  function fitAll() {
    const map = mapRef.current;
    if (!map) return;
    const all: [number, number][] = [...stopPts.current];
    pins.forEach(p => all.push([p.lat, p.lng]));
    if (me) all.push([me.lat, me.lng]);
    if (all.length === 0) return;
    const sig = all.map(p => p.join(',')).sort().join('|');
    if (sig === lastFitSig.current) return;
    lastFitSig.current = sig;
    if (all.length === 1) map.setView(all[0], 13);
    else map.fitBounds(L.latLngBounds(all).pad(0.25));
  }

  // ── Create the map once ─────────────────────────────────────
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);
    stopLayer.current = L.layerGroup().addTo(map);
    pinLayer.current = L.layerGroup().addTo(map);
    meLayer.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => tapRef.current?.(e.latlng.lat, e.latlng.lng));
    map.setView([20, 0], 2); // neutral start until we have points
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Geocode stops → draw route + numbered pins ──────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pts: { stop: Stop; lat: number; lng: number }[] = [];
      for (const s of stops) {
        const g = await geocode(s.label);
        if (g) pts.push({ stop: s, ...g });
      }
      if (cancelled || !mapRef.current || !stopLayer.current) return;

      stopLayer.current.clearLayers();
      const latlngs: [number, number][] = [];
      pts.forEach((p, i) => {
        const color = PIN_COLORS[i % PIN_COLORS.length];
        const html = `<div class="cmap-pin" style="--c:${color}"><span>${esc(p.stop.emoji)}</span><b>${i + 1}</b></div>`;
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: 'cmap-icon', iconSize: [46, 46], iconAnchor: [23, 23] }),
        }).addTo(stopLayer.current!).bindPopup(`<b>${esc(p.stop.label)}</b><br>${esc(p.stop.date)}`);
        latlngs.push([p.lat, p.lng]);
      });
      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: '#0f766e', weight: 4, opacity: 0.85, dashArray: '1 12', lineCap: 'round' })
          .addTo(stopLayer.current!);
      }
      stopPts.current = latlngs;

      // Fall back to the illustrated string map only if there is a route we
      // meant to draw but nothing at all could be placed.
      if (stops.length > 0 && latlngs.length === 0 && pins.length === 0 && !me && !firedFallback.current) {
        firedFallback.current = true;
        onFallback();
        return;
      }
      fitAll();
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  // ── Draw custom (user-dropped) pins ─────────────────────────
  useEffect(() => {
    const layer = pinLayer.current;
    if (!layer) return;
    layer.clearLayers();
    pins.forEach(p => {
      const html = `<div class="cmap-drop"><span>${esc(p.emoji || '📍')}</span></div>`;
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ html, className: 'cmap-icon', iconSize: [40, 40], iconAnchor: [20, 36] }),
      }).addTo(layer);
      if (pinTapRef.current) {
        m.on('click', () => pinTapRef.current!(p));
      } else {
        // Read-only (portal): show the details in a popup.
        const note = p.note ? `<br>${esc(p.note)}` : '';
        m.bindPopup(`<b>${esc(p.label || 'Pin')}</b>${note}`);
      }
    });
    if (pins.length) setLoading(false);
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // ── Draw the "you are here" marker ──────────────────────────
  useEffect(() => {
    const layer = meLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (me) {
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ html: '<div class="cmap-me"><i></i></div>', className: 'cmap-icon', iconSize: [20, 20], iconAnchor: [10, 10] }),
        interactive: false, zIndexOffset: 1000,
      }).addTo(layer);
      setLoading(false);
    }
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <div className="px-3 py-4">
      <div className="cmap relative">
        <div ref={ref} className="cmap-canvas" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400 z-[500]">
            Loading your map…
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-400 mt-3">
        {onMapTap ? 'Tap the map to drop a pin · ' : ''}pinch to zoom, drag to pan
      </p>
    </div>
  );
}
