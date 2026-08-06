/**
 * Calendar export — builds an iCalendar (.ics) file from the trip and hands
 * it to the phone: via the system share sheet when available, else saved to
 * Documents/TripPlanner/ so it can be opened with any calendar app.
 */
import type { Transport, Accommodation, CarRental, ItineraryEvent, TripMeta } from '../types';
import { isNative } from './platform';

const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const dt = (date: string, time?: string) => date.replace(/-/g, '') + (time ? `T${time.replace(':', '')}00` : '');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

interface Ev {
  uid: string; summary: string; location?: string; description?: string;
  date: string; time?: string; endDate?: string; endTime?: string;
}

function vevent(e: Ev): string {
  const allDay = !e.time;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}@trip-planner`,
    `DTSTAMP:${stamp()}`,
    allDay ? `DTSTART;VALUE=DATE:${dt(e.date)}` : `DTSTART:${dt(e.date, e.time)}`,
  ];
  if (e.endDate || e.endTime) {
    const ed = e.endDate || e.date;
    lines.push(allDay || !e.endTime ? `DTEND;VALUE=DATE:${dt(ed)}` : `DTEND:${dt(ed, e.endTime)}`);
  } else if (allDay) {
    lines.push(`DTEND;VALUE=DATE:${dt(e.date)}`);
  }
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

export function buildICS(
  trip: TripMeta | undefined, transport: Transport[], stays: Accommodation[],
  itinerary: ItineraryEvent[], carRentals: CarRental[] = [],
): string {
  const events: string[] = [];

  transport.filter(t => t.departDate).forEach(t => {
    const mode = t.mode.charAt(0).toUpperCase() + t.mode.slice(1);
    events.push(vevent({
      uid: t.id, date: t.departDate, time: t.departTime || undefined,
      endDate: t.arriveDate || undefined, endTime: t.arriveTime || undefined,
      summary: `${mode}: ${t.fromPlace} → ${t.toPlace}${t.flightNumber ? ` (${t.flightNumber})` : ''}`,
      location: t.fromPlace,
      description: [t.provider, t.confirmation && `Confirmation: ${t.confirmation}`, t.seat && `Seat: ${t.seat}`, t.notes]
        .filter(Boolean).join('\n'),
    }));
  });

  stays.filter(s => s.checkIn).forEach(s => {
    events.push(vevent({
      uid: s.id, date: s.checkIn, endDate: s.checkOut || undefined,
      summary: `Stay: ${s.name}`,
      location: [s.address, s.city].filter(Boolean).join(', '),
      description: [s.confirmation && `Confirmation: ${s.confirmation}`, s.contact, s.notes].filter(Boolean).join('\n'),
    }));
  });

  itinerary.filter(e => e.date).forEach(e => {
    events.push(vevent({
      uid: e.id, date: e.date, time: e.startTime || undefined, endTime: e.endTime || undefined,
      summary: e.title, location: e.place || undefined, description: e.notes || undefined,
    }));
  });

  carRentals.filter(r => r.pickupDate).forEach(r => {
    events.push(vevent({
      uid: r.id, date: r.pickupDate, time: r.pickupTime || undefined,
      endDate: r.dropoffDate || undefined, endTime: r.dropoffTime || undefined,
      summary: `Car rental: ${r.company || 'Reservation'}${r.carType ? ` (${r.carType})` : ''}`,
      location: r.pickupLocation || undefined,
      description: [
        r.dropoffLocation && `Drop-off: ${r.dropoffLocation}`,
        r.confirmation && `Reservation: ${r.confirmation}`,
        r.driver && `Driver: ${r.driver}`, r.contact, r.notes,
      ].filter(Boolean).join('\n'),
    }));
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Trip Planner//${esc(trip?.name || 'Trip')}//EN`,
    `X-WR-CALNAME:${esc(trip?.name || 'Trip Planner')}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Export the calendar; returns a human message saying where it went. */
export async function exportCalendar(
  trip: TripMeta | undefined, transport: Transport[], stays: Accommodation[],
  itinerary: ItineraryEvent[], carRentals: CarRental[] = [],
): Promise<string> {
  const ics = buildICS(trip, transport, stays, itinerary, carRentals);
  const name = `${(trip?.name || 'trip').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;

  // Preferred: the system share sheet (open straight into a calendar app).
  try {
    const file = new File([ics], name, { type: 'text/calendar' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: trip?.name || 'Trip' });
      return 'Shared — pick your calendar app to import it.';
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'Share cancelled.';
    /* fall through to saving */
  }

  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: `TripPlanner/${name}`, data: ics,
      directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true,
    });
    return `Saved to Documents/TripPlanner/${name} — open it with your calendar app.`;
  }

  // Web: trigger a download.
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'Downloaded — open the .ics file with your calendar.';
}
