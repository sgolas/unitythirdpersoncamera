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
 *   • the user's current location (a pulsing "you are here" dot) and zooms
 *     the map straight in to it, and
 *   • custom pins the user has dropped — tap a pin to see its info in a little
 *     bubble, press-and-hold a pin to edit it.
 * Tapping empty map calls `onMapTap` so the caller can drop a new pin there.
 *
 * Place names are geocoded with the free Nominatim service and cached in
 * localStorage so it only looks each place up once. If nothing can be located
 * (e.g. offline) and there are no pins or location, the caller falls back to
 * the illustrated string map.
 */

const PIN_COLORS = ['#0ea5a3', '#fb7185', '#f59e0b', '#a78bfa', '#38bdf8', '#34d399'];
const ME_ZOOM = 16;         // street-level zoom when we lock onto current location
const HOLD_MS = 500;        // press-and-hold duration to trigger edit

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

/** The little info bubble shown for a dropped pin. */
function pinPopupHtml(p: MapPin): string {
  const note = p.note ? `<br><span class="cmap-pop-note">${esc(p.note)}</span>` : '';
  return `<b>${esc(p.label || 'Pin')}</b>${note}`;
}

interface Props {
  stops: Stop[];
  onFallback: () => void;
  pins?: MapPin[];
  me?: LatLng | null;
  onMapTap?: (lat: number, lng: number) => void;
  onPinEdit?: (pin: MapPin) => void;
  /** Fly to this spot (e.g. a pin picked from the drawer list). `n` makes
   *  repeated picks of the same pin re-trigger the flight. */
  focus?: { lat: number; lng: number; pin?: MapPin; n: number } | null;
}

export function TripLeafletMap({ stops, onFallback, pins = [], me = null, onMapTap, onPinEdit, focus = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stopLayer = useRef<L.LayerGroup | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const stopPts = useRef<[number, number][]>([]);
  const didInitialView = useRef(false);
  const firedFallback = useRef(false);
  const [loading, setLoading] = useState(true);

  // Keep the latest callbacks reachable from Leaflet event handlers.
  const tapRef = useRef(onMapTap); tapRef.current = onMapTap;
  const editRef = useRef(onPinEdit); editRef.current = onPinEdit;

  /** Fit the view to the trip route — used only on first load when we don't
   *  have a current location to zoom into. */
  function fitStops() {
    const map = mapRef.current;
    if (!map || didInitialView.current) return;
    const all = stopPts.current;
    if (all.length === 0) return;
    didInitialView.current = true;
    if (all.length === 1) map.setView(all[0], 12);
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
    // Tap on empty map: if an info bubble is open, just dismiss it; otherwise
    // offer to drop a new pin there.
    let popupShowing = false;
    map.on('popupopen', () => { popupShowing = true; });
    map.on('popupclose', () => { setTimeout(() => { popupShowing = false; }, 0); });
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (popupShowing) { map.closePopup(); return; }
      tapRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    map.setView([20, 0], 2); // neutral start until we have points
    mapRef.current = map;
    // Test hook (only when ?e2e=1) so automated checks can read the zoom/center.
    if (new URLSearchParams(location.search).has('e2e')) (window as unknown as { __map?: L.Map }).__map = map;
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
        // Direction arrows: one at each segment's midpoint, rotated to point
        // from the previous stop to the next. The angle is computed in
        // projected (Mercator) space so it matches the drawn line at any zoom.
        const mapNow = mapRef.current!;
        for (let i = 1; i < latlngs.length; i++) {
          const a = mapNow.project(L.latLng(latlngs[i - 1]), 12);
          const b = mapNow.project(L.latLng(latlngs[i]), 12);
          const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          const mid = mapNow.unproject(a.add(b).divideBy(2), 12);
          L.marker(mid, {
            icon: L.divIcon({
              html: `<div class="cmap-arrow" style="transform:rotate(${ang}deg)">➤</div>`,
              className: 'cmap-icon', iconSize: [22, 22], iconAnchor: [11, 11],
            }),
            interactive: false,
          }).addTo(stopLayer.current!);
        }
      }
      stopPts.current = latlngs;

      // Fall back to the illustrated string map only if there is a route we
      // meant to draw but nothing at all could be placed.
      if (stops.length > 0 && latlngs.length === 0 && pins.length === 0 && !me && !firedFallback.current) {
        firedFallback.current = true;
        onFallback();
        return;
      }
      fitStops(); // only fits if we haven't already locked onto a location
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  // ── Draw custom (user-dropped) pins ─────────────────────────
  useEffect(() => {
    const layer = pinLayer.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    pins.forEach(p => {
      const html = `<div class="cmap-drop"><span>${esc(p.emoji || '📍')}</span></div>`;
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ html, className: 'cmap-icon', iconSize: [40, 40], iconAnchor: [20, 36] }),
      }).addTo(layer);

      // Tap shows the info bubble; press-and-hold opens the editor.
      const popupHtml = pinPopupHtml(p);

      const el = m.getElement();
      if (!el) {
        // Fallback: no DOM handle → just show info on click.
        m.bindPopup(popupHtml, { offset: [0, -30] });
        return;
      }
      // Keep pin taps from reaching the map (which would open the new-pin
      // sheet and dismiss the bubble we're about to show).
      L.DomEvent.disableClickPropagation(el);
      el.addEventListener('contextmenu', e => e.preventDefault()); // Android long-press menu

      let timer: ReturnType<typeof setTimeout> | null = null;
      let held = false;
      let moved = false;
      let sx = 0, sy = 0;
      const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
      const down = (x: number, y: number) => {
        held = false; moved = false; sx = x; sy = y;
        if (!editRef.current) return; // read-only (portal): no hold-to-edit
        clear();
        timer = setTimeout(() => { held = true; map.closePopup(); editRef.current!(p); }, HOLD_MS);
      };
      const move = (x: number, y: number) => {
        if (Math.hypot(x - sx, y - sy) > 10) { moved = true; clear(); }
      };
      const up = () => {
        clear();
        if (!held && !moved) {
          // A genuine tap → show the info bubble.
          L.popup({ offset: [0, -30], className: 'cmap-pop' })
            .setLatLng([p.lat, p.lng]).setContent(popupHtml).openOn(map);
        }
        held = false;
      };
      el.addEventListener('pointerdown', e => down((e as PointerEvent).clientX, (e as PointerEvent).clientY));
      el.addEventListener('pointermove', e => move((e as PointerEvent).clientX, (e as PointerEvent).clientY));
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', clear);
      el.addEventListener('pointerleave', clear);
    });

    if (pins.length) setLoading(false);
    // Don't refit/zoom when pins change — dropping a pin shouldn't move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // ── Draw the "you are here" marker + zoom straight in to it ──
  useEffect(() => {
    const layer = meLayer.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (me) {
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ html: '<div class="cmap-me"><i></i></div>', className: 'cmap-icon', iconSize: [20, 20], iconAnchor: [10, 10] }),
        interactive: false, zIndexOffset: 1000,
      }).addTo(layer);
      // Auto-zoom in to the current location.
      didInitialView.current = true;
      map.setView([me.lat, me.lng], ME_ZOOM, { animate: true });
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // ── Fly to a picked pin (from the drawer list) ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    didInitialView.current = true;
    map.setView([focus.lat, focus.lng], 17, { animate: true });
    if (focus.pin) {
      L.popup({ offset: [0, -30], className: 'cmap-pop' })
        .setLatLng([focus.lat, focus.lng]).setContent(pinPopupHtml(focus.pin)).openOn(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

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
        {onMapTap ? 'Tap the map to drop a pin · tap a pin for info · hold to edit' : 'tap a pin for info'}
      </p>
    </div>
  );
}
