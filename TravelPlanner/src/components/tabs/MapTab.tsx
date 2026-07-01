import { useState } from 'react';
import { useTransport, useAccommodation, useItinerary, useTrip } from '../../hooks/useTrip';
import { TabHeader, EmptyState } from '../ui';
import { computeStops, StringMap } from '../tripMap';
import { TripLeafletMap } from '../TripLeafletMap';

/**
 * Trip Map: a real geographic map with a playful cartoon treatment. If places
 * can't be located (offline / unknown), it falls back to the illustrated
 * string-map so there's always something to show.
 */
export function MapTab() {
  const trip = useTrip();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const [fallback, setFallback] = useState(false);

  const stops = computeStops(transport, stays, itinerary);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Map" subtitle={trip?.destinations || 'Your route'}
        gradient="linear-gradient(135deg,#0f766e,#0ea5a3)" icon="🗺️" />

      {stops.length === 0 ? (
        <EmptyState emoji="🗺️" title="No places pinned yet"
          hint="Add stays, transport, or itinerary spots and they'll appear here on the map" />
      ) : fallback ? (
        <>
          <div className="mx-4 mt-4 mb-1 text-xs text-slate-400 text-center">Showing the illustrated route (couldn't load the live map)</div>
          <StringMap stops={stops} />
        </>
      ) : (
        <TripLeafletMap stops={stops} onFallback={() => setFallback(true)} />
      )}
    </div>
  );
}
