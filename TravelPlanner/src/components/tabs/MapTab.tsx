import { useEffect, useRef, useState } from 'react';
import { MapPin as MapPinIcon, Crosshair, Loader, SlidersHorizontal, Check, ChevronDown, Pencil } from 'lucide-react';
import { useTransport, useAccommodation, useItinerary, useTrip, useMapPins } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { MapPin, PinCategory } from '../../types';
import { getCurrentLocation, type LatLng } from '../../lib/geo';
import { TabHeader, EmptyState, Sheet, Field, TextInput, TextArea, FormFooter, ConfirmDelete, Overlay } from '../ui';
import { computeStops, StringMap } from '../tripMap';
import { TripLeafletMap } from '../TripLeafletMap';

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
  const [focus, setFocus] = useState<{ lat: number; lng: number; pin?: MapPin; n: number } | null>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  const stops = computeStops(transport, stays, itinerary);
  const visibleStops = filter === 'all' ? stops
    : stops.filter(s => s.kind === catOf(filter)?.stopKind);
  const visiblePins = filter === 'all' ? pins
    : pins.filter(p => (p.category ?? 'other') === filter);
  const hasMap = stops.length > 0 || pins.length > 0 || !!me;

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
          <TripLeafletMap stops={visibleStops} pins={visiblePins} me={me} focus={focus}
            onFallback={() => setFallback(true)}
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

          {/* Drop-a-pin-at-my-location button, floating over the map. */}
          <button onClick={() => locate(true)} disabled={locating}
            className="absolute right-7 bottom-16 z-[600] w-14 h-14 rounded-full accent-gradient text-white shadow-lg flex items-center justify-center active:scale-90 transition disabled:opacity-60"
            aria-label="Drop a pin at my location">
            {locating ? <Loader className="animate-spin" size={22} /> : <MapPinIcon size={24} />}
          </button>
        </div>

        <PinDrawer pins={visiblePins}
          onPick={p => {
            setFocus({ lat: p.lat, lng: p.lng, pin: p, n: Date.now() });
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

      {sheet && (
        <PinSheet lat={sheet.lat} lng={sheet.lng} pin={sheet.pin}
          defaultCategory={filter === 'all' ? 'other' : filter}
          onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/* ── Expandable drawer listing all dropped pins ─────────────── */
function PinDrawer({ pins, onPick, onEdit }: {
  pins: MapPin[];
  onPick: (p: MapPin) => void;
  onEdit: (p: MapPin) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-3 mb-4 bg-surface rounded-3xl shadow-soft border border-line overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 active:bg-slate-50 transition"
        aria-expanded={open} aria-label="Pin list">
        <span className="text-lg">📍</span>
        <span className="flex-1 text-left font-bold text-content">My pins
          <span className="ml-1.5 text-xs font-semibold text-muted">({pins.length})</span>
        </span>
        <ChevronDown size={18} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        pins.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">No pins yet — tap the map or use the 📍 button to drop one.</p>
        ) : (
          <div className="border-t border-line divide-y divide-line">
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
