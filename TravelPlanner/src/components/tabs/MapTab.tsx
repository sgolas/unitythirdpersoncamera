import { useEffect, useState } from 'react';
import { MapPin as MapPinIcon, Crosshair, Loader } from 'lucide-react';
import { useTransport, useAccommodation, useItinerary, useTrip, useMapPins } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { MapPin } from '../../types';
import { getCurrentLocation, type LatLng } from '../../lib/geo';
import { TabHeader, EmptyState, Sheet, Field, TextInput, TextArea, FormFooter, ConfirmDelete } from '../ui';
import { computeStops, StringMap } from '../tripMap';
import { TripLeafletMap } from '../TripLeafletMap';

const PIN_EMOJIS = ['📍', '🏨', '🍽️', '☕', '🏖️', '⛰️', '🎡', '🛍️', '🚉', '⭐', '⚠️', '🅿️'];

/**
 * Trip Map: a real geographic map with a playful cartoon treatment. Shows the
 * trip route, your current location, and any custom pins you drop — tap the map
 * (or the locate button) to add a pin with your own notes. Falls back to the
 * illustrated string-map if nothing can be located and there's a route to draw.
 */
export function MapTab() {
  const trip = useTrip();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const pins = useMapPins();
  const [fallback, setFallback] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const [sheet, setSheet] = useState<{ pin: MapPin | null; lat: number; lng: number } | null>(null);

  const stops = computeStops(transport, stays, itinerary);
  const hasMap = stops.length > 0 || pins.length > 0 || !!me;

  // Show the user's starting location automatically the first time they open the map.
  useEffect(() => { locate(false); /* eslint-disable-next-line */ }, []);

  async function locate(openSheet: boolean) {
    setLocating(true); setGeoErr('');
    try {
      const loc = await getCurrentLocation();
      setMe(loc);
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
        <div className="relative">
          <TripLeafletMap stops={stops} pins={pins} me={me}
            onFallback={() => setFallback(true)}
            onMapTap={(lat, lng) => setSheet({ pin: null, lat, lng })}
            onPinEdit={pin => setSheet({ pin, lat: pin.lat, lng: pin.lng })} />

          {/* Drop-a-pin-at-my-location button, floating over the map. */}
          <button onClick={() => locate(true)} disabled={locating}
            className="absolute right-7 bottom-16 z-[600] w-14 h-14 rounded-full accent-gradient text-white shadow-lg flex items-center justify-center active:scale-90 transition disabled:opacity-60"
            aria-label="Drop a pin at my location">
            {locating ? <Loader className="animate-spin" size={22} /> : <MapPinIcon size={24} />}
          </button>
        </div>
      )}

      {sheet && (
        <PinSheet lat={sheet.lat} lng={sheet.lng} pin={sheet.pin} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

function PinSheet({ lat, lng, pin, onClose }: { lat: number; lng: number; pin: MapPin | null; onClose: () => void }) {
  const [label, setLabel] = useState(pin?.label ?? '');
  const [note, setNote] = useState(pin?.note ?? '');
  const [emoji, setEmoji] = useState(pin?.emoji ?? '📍');
  const [confirmDel, setConfirmDel] = useState(false);

  async function save() {
    const isNew = !pin;
    await put<MapPin>({
      kind: 'mappin', id: pin?.id ?? crypto.randomUUID(),
      label: label.trim() || 'Dropped pin', note: note.trim(), emoji,
      lat, lng, updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Dropped' : 'Updated'} map pin: ${label.trim() || 'Dropped pin'}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={pin ? 'Edit pin' : 'Drop a pin here'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel={pin ? 'Save' : 'Drop pin'} />}>
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
