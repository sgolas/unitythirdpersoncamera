import { useEffect, useRef, useState } from 'react';
import { MapPin as MapPinIcon, Crosshair, Loader, SlidersHorizontal, Check, ChevronDown, Pencil, Route, Sparkles, Navigation, Star, Plus } from 'lucide-react';
import { useTransport, useAccommodation, useItinerary, useTrip, useMapPins } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { MapPin, PinCategory } from '../../types';
import { getCurrentLocation, type LatLng } from '../../lib/geo';
import { TabHeader, EmptyState, Sheet, Field, TextInput, TextArea, FormFooter, ConfirmDelete, Overlay } from '../ui';
import { computeStops, StringMap } from '../tripMap';
import { TripLeafletMap, type PlacedStop } from '../TripLeafletMap';
import { CountryPicker } from '../CountryPicker';
import type { Bounds } from '../../lib/countries';
import { fmtDate } from '../../utils/format';
import { optimizeRoute, pathLengthKm, googleMapsDirections, googleMapsPlace, type RoutePoint } from '../../lib/route';
import { findNearby, type NearbyPlace } from '../../lib/discover';

/** Open an external link (maps app / browser) from the Capacitor WebView. */
function openExternal(url: string) { window.open(url, '_blank', 'noopener'); }

const PIN_EMOJIS = ['📍', '🏨', '🍽️', '☕', '🏖️', '⛰️', '🎡', '🛍️', '✈️', '🚉', '⭐', '⚠️', '🅿️'];

/** Pin categories — used both to tag dropped pins and to filter the map.
 *  `stopKind` maps a category onto the trip-route stops so filtering also
 *  narrows the route pins (flights → transport, hotels → stays, …). */
const CATS: { key: PinCategory; label: string; emoji: string; stopKind: string | null }[] = [
  { key: 'flight',     label: 'Flights',     emoji: '✈️', stopKind: 'transport' },
  { key: 'restaurant', label: 'Restaurants', emoji: '🍽️', stopKind: null },
  { key: 'attraction', label: 'Attractions', emoji: '🎡', stopKind: 'event' },
  { key: 'hotel',      label: 'Hotels',      emoji: '🏨', stopKind: 'stay' },
];
const catOf = (k: PinCategory) => CATS.find(c => c.key === k);

/* Remember the last GPS fix so the map can zoom to you the instant it opens,
 * then refine once a fresh fix arrives (a cold fix can take several seconds). */
const LAST_LOC_KEY = 'map.lastloc';
function loadLastLocation(): LatLng | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_LOC_KEY) || 'null');
    return v && typeof v.lat === 'number' && typeof v.lng === 'number' ? v : null;
  } catch { return null; }
}
function saveLastLocation(loc: LatLng) {
  try { localStorage.setItem(LAST_LOC_KEY, JSON.stringify(loc)); } catch { /* full */ }
}

/**
 * Trip Map: a real geographic map with a playful cartoon treatment. Shows the
 * trip route (with direction arrows), your current location, and any custom
 * pins you drop — tap the map (or the locate button) to add a pin with your
 * own notes; the filter button narrows the map to one kind of place. Falls
 * back to the illustrated string-map if nothing can be located.
 */
export function MapTab() {
  const trip = useTrip();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const pins = useMapPins();
  const [fallback, setFallback] = useState(false);
  // Start from the last known fix so the map opens zoomed-in on you right away.
  const [me, setMe] = useState<LatLng | null>(loadLastLocation);
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const [sheet, setSheet] = useState<{ pin: MapPin | null; lat: number; lng: number } | null>(null);
  const [filter, setFilter] = useState<'all' | PinCategory>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; pin?: MapPin; label?: string; sub?: string; n: number } | null>(null);
  const [region, setRegion] = useState<{ bounds: Bounds; n: number } | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [placedStops, setPlacedStops] = useState<PlacedStop[]>([]);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  const stops = computeStops(transport, stays, itinerary);
  const visibleStops = filter === 'all' ? stops
    : stops.filter(s => s.kind === catOf(filter)?.stopKind);
  const visiblePins = filter === 'all' ? pins
    : pins.filter(p => (p.category ?? 'other') === filter);
  const hasMap = stops.length > 0 || pins.length > 0 || !!me;

  // Places to route through: geocoded trip stops + dropped pins.
  const routePlaces: RoutePoint[] = [
    ...placedStops.map(s => ({ label: s.stop.label, lat: s.lat, lng: s.lng })),
    ...visiblePins.map(p => ({ label: p.label || 'Pin', lat: p.lat, lng: p.lng })),
  ];
  const anchor: RoutePoint | null = me ? { label: 'Your location', lat: me.lat, lng: me.lng } : (routePlaces[0] ?? null);

  // Refresh with a fresh GPS fix as soon as the map opens.
  useEffect(() => { locate(false); /* eslint-disable-next-line */ }, []);

  async function locate(openSheet: boolean) {
    setLocating(true); setGeoErr('');
    try {
      const loc = await getCurrentLocation();
      setMe(loc);
      saveLastLocation(loc);
      setFallback(false);
      if (openSheet) setSheet({ pin: null, lat: loc.lat, lng: loc.lng });
    } catch (e) {
      setGeoErr(e instanceof Error ? e.message : 'Location unavailable');
    }
    setLocating(false);
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Map" subtitle={trip?.destinations || 'Your route'}
        gradient="linear-gradient(135deg,#0f766e,#0ea5a3)" icon="🗺️" />

      {geoErr && (
        <div className="mx-4 mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {geoErr}
        </div>
      )}

      {!hasMap ? (
        locating ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader className="animate-spin" size={26} /> Finding your location…
          </div>
        ) : (
          <EmptyState emoji="🗺️" title="Nothing on the map yet"
            hint="Show where you are, or add stays, transport and itinerary spots and they'll appear here"
            action={<button onClick={() => locate(true)}
              className="px-4 py-2.5 rounded-2xl font-semibold text-white accent-gradient active:scale-95 transition flex items-center gap-1.5">
              <Crosshair size={16} /> Use my location</button>} />
        )
      ) : fallback ? (
        <>
          <div className="mx-4 mt-4 mb-1 text-xs text-slate-400 text-center">Showing the illustrated route (couldn't load the live map)</div>
          <StringMap stops={stops} />
        </>
      ) : (
        <>
        <div className="relative" ref={mapBoxRef}>
          <TripLeafletMap stops={visibleStops} pins={visiblePins} me={me} focus={focus} region={region}
            onFallback={() => setFallback(true)}
            onStopsPlaced={pts => setPlacedStops(prev =>
              // Keep the same state identity when nothing changed, so the
              // geocode effect re-running doesn't cause a render loop.
              prev.length === pts.length && prev.every((x, i) =>
                x.stop.label === pts[i].stop.label && x.lat === pts[i].lat && x.lng === pts[i].lng)
                ? prev : pts)}
            onMapTap={(lat, lng) => setSheet({ pin: null, lat, lng })}
            onPinEdit={pin => setSheet({ pin, lat: pin.lat, lng: pin.lng })} />

          {/* Filter what the map shows. */}
          <button onClick={() => setFilterOpen(true)}
            className={`absolute right-7 top-8 z-[600] h-11 rounded-full shadow-lg border flex items-center justify-center gap-1.5 px-3.5 active:scale-95 transition ${
              filter === 'all' ? 'bg-surface border-line text-content' : 'accent-gradient border-transparent text-white'
            }`}
            aria-label="Filter map">
            {filter === 'all'
              ? <SlidersHorizontal size={18} />
              : <><span className="text-base leading-none">{catOf(filter)?.emoji}</span>
                  <span className="text-sm font-bold">{catOf(filter)?.label}</span></>}
          </button>

          {/* Focus the map on a country. */}
          <button onClick={() => setCountryOpen(true)}
            className="absolute right-7 top-[5.25rem] z-[600] w-11 h-11 rounded-full bg-surface shadow-lg border border-line flex items-center justify-center text-lg active:scale-95 transition"
            aria-label="Focus on a country">
            🌐
          </button>

          {/* Drop-a-pin-at-my-location button, floating over the map. */}
          <button onClick={() => locate(true)} disabled={locating}
            className="absolute right-7 bottom-16 z-[600] w-14 h-14 rounded-full accent-gradient text-white shadow-lg flex items-center justify-center active:scale-90 transition disabled:opacity-60"
            aria-label="Drop a pin at my location">
            {locating ? <Loader className="animate-spin" size={22} /> : <MapPinIcon size={24} />}
          </button>
        </div>

        {/* Planning toolbar */}
        <div className="flex gap-2 px-3 mt-3">
          <button onClick={() => setRouteOpen(true)} disabled={routePlaces.length < 2}
            className="flex-1 py-2.5 rounded-2xl font-semibold text-content bg-surface border border-line shadow-soft active:scale-[0.98] disabled:opacity-40 transition flex items-center justify-center gap-1.5">
            <Route size={17} className="text-accent" /> Plan route
          </button>
          <button onClick={() => setNearbyOpen(true)} disabled={!anchor}
            className="flex-1 py-2.5 rounded-2xl font-semibold text-content bg-surface border border-line shadow-soft active:scale-[0.98] disabled:opacity-40 transition flex items-center justify-center gap-1.5">
            <Sparkles size={17} className="text-accent" /> Nearby
          </button>
        </div>

        <PinDrawer pins={visiblePins} stops={placedStops}
          onPick={p => {
            setFocus({ lat: p.lat, lng: p.lng, pin: p, n: Date.now() });
            mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onPickStop={s => {
            setFocus({ lat: s.lat, lng: s.lng, label: s.stop.label, sub: fmtDate(s.stop.date), n: Date.now() });
            mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onEdit={p => setSheet({ pin: p, lat: p.lat, lng: p.lng })} />
        </>
      )}

      {filterOpen && (
        <FilterModal current={filter}
          onPick={f => { setFilter(f); setFilterOpen(false); }}
          onClose={() => setFilterOpen(false)} />
      )}

      {countryOpen && (
        <CountryPicker
          onPick={bounds => {
            setRegion({ bounds, n: Date.now() });
            setCountryOpen(false);
            mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onClose={() => setCountryOpen(false)} />
      )}

      {routeOpen && (
        <RouteSheet places={routePlaces} start={me ? anchor : null} onClose={() => setRouteOpen(false)} />
      )}

      {nearbyOpen && anchor && (
        <NearbySheet anchor={anchor}
          onDrop={(name, cat, lat, lng) => {
            void put<MapPin>({
              kind: 'mappin', id: crypto.randomUUID(), label: name, note: '',
              emoji: catOf(cat)?.emoji ?? '⭐', category: cat, lat, lng,
              updatedAt: '', updatedBy: '',
            }, `Added map pin: ${name}`, 'create');
          }}
          onClose={() => setNearbyOpen(false)} />
      )}

      {sheet && (
        <PinSheet lat={sheet.lat} lng={sheet.lng} pin={sheet.pin}
          defaultCategory={filter === 'all' ? 'other' : filter}
          onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/* ── Expandable drawer listing everything on the map ────────── */
const STOP_KIND_LABEL: Record<string, string> = {
  stay: 'Stay', transport: 'Travel', event: 'Itinerary spot',
};

function PinDrawer({ pins, stops, onPick, onPickStop, onEdit }: {
  pins: MapPin[];
  stops: PlacedStop[];
  onPick: (p: MapPin) => void;
  onPickStop: (s: PlacedStop) => void;
  onEdit: (p: MapPin) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = pins.length + stops.length;
  return (
    <div className="mx-3 mb-4 bg-surface rounded-3xl shadow-soft border border-line overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 active:bg-slate-50 transition"
        aria-expanded={open} aria-label="Pin list">
        <span className="text-lg">📍</span>
        <span className="flex-1 text-left font-bold text-content">Places on the map
          <span className="ml-1.5 text-xs font-semibold text-muted">({total})</span>
        </span>
        <ChevronDown size={18} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        total === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">Nothing yet — add flights, stays or itinerary spots, or drop a pin on the map.</p>
        ) : (
          <div className="border-t border-line">
            {stops.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Trip route</p>
                <div className="divide-y divide-line">
                  {stops.map((s, i) => (
                    <div key={`${s.stop.label}-${i}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 transition"
                      onClick={() => onPickStop(s)} role="button" aria-label={`Go to ${s.stop.label}`}>
                      <span className="relative w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center text-lg flex-shrink-0">
                        {s.stop.emoji}
                        <b className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full bg-ink text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</b>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-content truncate">{s.stop.label}</p>
                        <p className="text-xs text-muted truncate">
                          {STOP_KIND_LABEL[s.stop.kind] ?? 'Stop'}{s.stop.date ? ` · ${fmtDate(s.stop.date)}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {pins.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">My pins</p>
                <div className="divide-y divide-line">
                  {pins.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 transition"
                      onClick={() => onPick(p)} role="button" aria-label={`Go to ${p.label || 'pin'}`}>
                      <span className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-lg flex-shrink-0">
                        {p.emoji || '📍'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-content truncate">{p.label || 'Dropped pin'}</p>
                        {(p.note || p.category) && (
                          <p className="text-xs text-muted truncate">
                            {p.category && p.category !== 'other' ? `${catOf(p.category)?.emoji} ${catOf(p.category)?.label}` : ''}
                            {p.category && p.category !== 'other' && p.note ? ' · ' : ''}
                            {p.note}
                          </p>
                        )}
                      </div>
                      <button onClick={e => { e.stopPropagation(); onEdit(p); }} aria-label={`Edit ${p.label || 'pin'}`}
                        className="p-2 rounded-lg text-muted active:bg-slate-200 flex-shrink-0">
                        <Pencil size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

/* ── Filter popup ───────────────────────────────────────────── */
function FilterModal({ current, onPick, onClose }: {
  current: 'all' | PinCategory;
  onPick: (f: 'all' | PinCategory) => void;
  onClose: () => void;
}) {
  const options: { key: 'all' | PinCategory; label: string; emoji: string }[] = [
    { key: 'all', label: 'View all', emoji: '🌍' },
    ...CATS.map(c => ({ key: c.key, label: c.label, emoji: c.emoji })),
  ];
  return (
    <Overlay>
      <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
        <div className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="font-bold text-content text-lg">Filter the map</p>
          <p className="text-xs text-muted mb-4">Choose what kind of pins to show</p>
          <div className="space-y-1.5">
            {options.map(o => (
              <button key={o.key} onClick={() => onPick(o.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border-2 transition text-left ${
                  current === o.key ? 'border-accent bg-accent/5' : 'border-line active:bg-slate-50'
                }`}>
                <span className="text-xl">{o.emoji}</span>
                <span className="flex-1 font-semibold text-content">{o.label}</span>
                {current === o.key && <Check size={18} className="text-accent" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/* ── Add / edit a dropped pin ───────────────────────────────── */
function PinSheet({ lat, lng, pin, defaultCategory, onClose }: {
  lat: number; lng: number; pin: MapPin | null; defaultCategory: PinCategory; onClose: () => void;
}) {
  const [label, setLabel] = useState(pin?.label ?? '');
  const [note, setNote] = useState(pin?.note ?? '');
  const [category, setCategory] = useState<PinCategory>(pin?.category ?? defaultCategory);
  const [emoji, setEmoji] = useState(pin?.emoji ?? (catOf(defaultCategory)?.emoji ?? '📍'));
  const [confirmDel, setConfirmDel] = useState(false);

  function pickCategory(c: PinCategory) {
    setCategory(c);
    // Picking a type also picks a sensible marker (still changeable below).
    setEmoji(catOf(c)?.emoji ?? '📍');
  }

  async function save() {
    const isNew = !pin;
    await put<MapPin>({
      kind: 'mappin', id: pin?.id ?? crypto.randomUUID(),
      label: label.trim() || 'Dropped pin', note: note.trim(), emoji, category,
      lat, lng, updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Dropped' : 'Updated'} map pin: ${label.trim() || 'Dropped pin'}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={pin ? 'Edit pin' : 'Drop a pin here'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel={pin ? 'Save' : 'Drop pin'} />}>
      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {[...CATS, { key: 'other' as PinCategory, label: 'Other', emoji: '📍' }].map(c => (
            <button key={c.key} onClick={() => pickCategory(c.key)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 border-2 transition ${
                category === c.key ? 'border-accent bg-accent/5 text-content' : 'border-line text-muted'
              }`}>
              <span>{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Marker">
        <div className="flex flex-wrap gap-2">
          {PIN_EMOJIS.map(em => (
            <button key={em} onClick={() => setEmoji(em)}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition ${emoji === em ? 'border-accent bg-accent/5' : 'border-line'}`}>
              {em}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Name"><TextInput autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Great pizza place" /></Field>
      <Field label="Notes"><TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything worth remembering about this spot…" /></Field>
      <p className="text-[11px] text-slate-400 px-1">📌 {lat.toFixed(5)}, {lng.toFixed(5)}</p>

      {pin && (
        <button onClick={() => setConfirmDel(true)}
          className="mt-4 w-full py-2.5 rounded-2xl font-semibold text-sunset border-2 border-line active:bg-rose-50 transition">
          Delete pin
        </button>
      )}
      {confirmDel && pin && (
        <ConfirmDelete label={pin.label || 'this pin'}
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => { await remove('mappin', pin.id, `Removed map pin: ${pin.label || 'Dropped pin'}`); onClose(); }} />
      )}
    </Sheet>
  );
}

/* ── Route planner: optimize order + open in Google Maps ────── */
function RouteSheet({ places, start, onClose }: {
  places: RoutePoint[]; start: RoutePoint | null; onClose: () => void;
}) {
  const [mode, setMode] = useState<'walking' | 'driving' | 'transit'>('driving');
  const ordered = optimizeRoute(places, start);
  const total = pathLengthKm(ordered);

  return (
    <Sheet title="Plan a route" onClose={onClose}
      footer={
        <button onClick={() => openExternal(googleMapsDirections(ordered, mode))}
          className="w-full py-3 rounded-2xl font-bold text-white accent-gradient active:scale-[0.98] transition flex items-center justify-center gap-2">
          <Navigation size={18} /> Open in Google Maps
        </button>
      }>
      <p className="text-sm text-slate-500 mb-3">
        Best order to visit {places.length} place{places.length === 1 ? '' : 's'}{start ? ', starting from you' : ''} — about <b>{total < 1 ? `${Math.round(total * 1000)} m` : `${total.toFixed(total < 10 ? 1 : 0)} km`}</b> door to door.
      </p>

      <div className="flex gap-1.5 mb-4">
        {([['driving', '🚗 Drive'], ['walking', '🚶 Walk'], ['transit', '🚆 Transit']] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition ${mode === m ? 'border-accent bg-accent/5 text-content' : 'border-line text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {ordered.map((p, i) => {
          const isStart = start && i === 0;
          return (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isStart ? 'bg-mint text-white' : 'accent-gradient text-white'}`}>
                {isStart ? '★' : i + (start ? 0 : 1)}
              </span>
              <span className="flex-1 min-w-0 truncate font-medium text-slate-800">{isStart ? 'Your location' : p.label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-3 px-1">Straight-line estimate; Google Maps gives exact turn-by-turn distances and times.</p>
    </Sheet>
  );
}

/* ── Nearby discovery: top-rated places around you ──────────── */
const NEARBY_CATS: { keyword: string; label: string; emoji: string; cat: PinCategory }[] = [
  { keyword: 'restaurants', label: 'Food',        emoji: '🍽️', cat: 'restaurant' },
  { keyword: 'cafes',       label: 'Cafés',       emoji: '☕', cat: 'restaurant' },
  { keyword: 'attractions', label: 'Attractions', emoji: '🎡', cat: 'attraction' },
  { keyword: 'bars',        label: 'Bars',        emoji: '🍺', cat: 'restaurant' },
  { keyword: 'shopping',    label: 'Shops',       emoji: '🛍️', cat: 'other' },
  { keyword: 'hotels',      label: 'Hotels',      emoji: '🏨', cat: 'hotel' },
];

function NearbySheet({ anchor, onDrop, onClose }: {
  anchor: RoutePoint;
  onDrop: (name: string, cat: PinCategory, lat: number, lng: number) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState(NEARBY_CATS[0]);
  const [items, setItems] = useState<NearbyPlace[] | null>(null);
  const [msg, setMsg] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setItems(null); setMsg('');
    findNearby(anchor.lat, anchor.lng, active.keyword).then(res => {
      if (!alive) return;
      if (res === 'not-configured') { setMsg('Place search isn’t set up yet.'); setItems([]); }
      else if (res === null) { setMsg('Couldn’t load places — check your connection.'); setItems([]); }
      else { setItems(res); if (res.length === 0) setMsg('Nothing found nearby for that.'); }
    });
    return () => { alive = false; };
  }, [active, anchor.lat, anchor.lng]);

  function distTo(p: NearbyPlace): string {
    const km = pathLengthKm([anchor, { label: '', lat: p.lat, lng: p.lng }]);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  return (
    <Sheet title="Places nearby" onClose={onClose}>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-3">
        {NEARBY_CATS.map(c => (
          <button key={c.keyword} onClick={() => setActive(c)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold flex-shrink-0 border-2 transition ${active.keyword === c.keyword ? 'border-accent bg-accent/5 text-content' : 'border-line text-muted'}`}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="flex items-center justify-center py-10 text-slate-400 gap-2"><Loader className="animate-spin" size={20} /> Finding the best {active.label.toLowerCase()}…</div>
      ) : msg && items.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">{msg}</p>
      ) : (
        <div className="space-y-2">
          {items.map((p, i) => {
            const dropped = added.has(p.name + p.lat);
            return (
              <div key={i} className="bg-white border border-line rounded-2xl px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">{p.address}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {p.rating != null && (
                        <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                          <Star size={12} className="fill-amber-500 text-amber-500" /> {p.rating.toFixed(1)}
                          {p.ratingCount != null && <span className="text-slate-400 font-normal">({p.ratingCount})</span>}
                        </span>
                      )}
                      <span className="text-slate-400">· {distTo(p)} away</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => { onDrop(p.name, active.cat, p.lat, p.lng); setAdded(s => new Set(s).add(p.name + p.lat)); }}
                    disabled={dropped}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold border border-line text-content active:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {dropped ? <><Check size={14} className="text-mint" /> Pinned</> : <><Plus size={14} /> Drop pin</>}
                  </button>
                  <button onClick={() => openExternal(googleMapsPlace({ label: p.name, lat: p.lat, lng: p.lng }))}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold accent-gradient text-white active:scale-[0.98] flex items-center justify-center gap-1.5">
                    <Navigation size={14} /> Directions
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3 px-1">Ratings from Google. Pinned places show on your map and sync to the family.</p>
    </Sheet>
  );
}
