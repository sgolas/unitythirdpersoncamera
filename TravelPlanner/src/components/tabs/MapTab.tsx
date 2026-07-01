import { useTransport, useAccommodation, useItinerary, useTrip } from '../../hooks/useTrip';
import { TabHeader, EmptyState } from '../ui';
import { computeStops, StringMap } from '../tripMap';

/**
 * A cartoonish "string map": every planned place (stays, transport
 * destinations, itinerary spots) becomes a pin, laid out in date order and
 * connected by a dashed string — like pins and yarn on a corkboard.
 */
export function MapTab() {
  const trip = useTrip();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();

  const stops = computeStops(transport, stays, itinerary);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Map" subtitle={trip?.destinations || 'Your route'}
        gradient="linear-gradient(135deg,#0f766e,#0ea5a3)" icon="🗺️" />

      {stops.length === 0 ? (
        <EmptyState emoji="🗺️" title="No places pinned yet"
          hint="Add stays, transport, or itinerary spots and they'll appear here as a route" />
      ) : (
        <>
          <StringMap stops={stops} />
          <p className="text-center text-xs text-slate-400 -mt-2 pb-2">pins come from your stays, transport &amp; itinerary</p>
        </>
      )}
    </div>
  );
}
