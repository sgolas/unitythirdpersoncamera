/**
 * Trip Timeline tab — wires the reusable <TripTimeline> to the app's store.
 *
 * Overnight stops are derived live from Stays (read-only here); the editable
 * "extra" stops and the legend are their own synced Dexie tables. All edits go
 * through put()/remove() so they log + sync like everything else.
 */
import { useEffect } from 'react';
import { useAccommodation, useTimelineStops, useTimelineLegend, useFuelRoutes, useTrip } from '../../hooks/useTrip';
import { db, put, remove } from '../../db/database';
import type { TimelineStop, TimelineLegendItem, TripMeta } from '../../types';
import { driveDuration, arrivalDateTime } from '../../lib/route';
import { TabHeader } from '../ui';
import { TripTimeline, SEED_LEGEND, type UnifiedStop, type StopPatch } from '../TripTimeline';

const SEED_FLAG = 'timeline.seeded';

export function TimelineTab() {
  const stays = useAccommodation();
  const extras = useTimelineStops();
  const legend = useTimelineLegend();
  const routes = useFuelRoutes();
  const trip = useTrip();

  // Seed the built-in legend once, and make sure every built-in type exists
  // (so upgrades that add a built-in — e.g. "Drive" — get it too).
  useEffect(() => {
    (async () => {
      const existing = new Set((await db.timelinelegend.toArray()).filter(l => !l.deleted).map(l => l.key));
      const firstRun = !localStorage.getItem(SEED_FLAG) && existing.size === 0;
      for (const l of SEED_LEGEND) {
        if (existing.has(l.key)) continue;
        if (!l.builtin && !firstRun) continue; // only auto-add built-ins after first run
        await put<TimelineLegendItem>({ ...l, id: crypto.randomUUID() }, `Added timeline type: ${l.label}`, 'create');
      }
      localStorage.setItem(SEED_FLAG, '1');
    })();
  }, []);

  const doneSet = new Set(trip?.timelineCompleted ?? []);
  // Merge stays (locked) + extra stops into the unified, date-ordered list.
  const stayStops: UnifiedStop[] = stays
    .filter(s => (s.city || s.name))
    .map(s => ({
      id: `stay-${s.id}`,
      city: s.city || s.name,
      startDate: s.checkIn,
      endDate: s.checkOut && s.checkOut > s.checkIn ? s.checkOut : null,
      type: 'overnight',
      tags: [],
      locked: true,
      source: 'stay' as const,
      completed: doneSet.has(`stay-${s.id}`),
    }));
  const extraStops: UnifiedStop[] = extras.map(s => ({
    id: s.id, city: s.city, startDate: s.startDate, endDate: s.endDate,
    type: s.type, tags: s.tags, locked: false, source: 'extra' as const,
    completed: doneSet.has(s.id),
  }));
  // Drives from the Fuel & Driving planner that have a departure date show as
  // read-only "travel" stops on the line (edit them on that page).
  const routeStops: UnifiedStop[] = routes
    .filter(r => r.departDate)
    .map(r => {
      const from = r.waypoints[0]?.label?.split(',')[0] || '';
      const to = r.waypoints[r.waypoints.length - 1]?.label?.split(',')[0] || '';
      const km = Math.round(r.distanceKm * (r.roundTrip ? 2 : 1));
      const arr = r.departTime && r.durationMin ? arrivalDateTime(r.departDate!, r.departTime, r.durationMin) : null;
      const tags: string[] = [];
      if (km > 0) tags.push(`${km} km`);
      if (r.durationMin) tags.push(driveDuration(r.durationMin * (r.roundTrip ? 2 : 1)));
      if (r.departTime) tags.push(arr ? `${r.departTime}→${arr.time}` : r.departTime);
      return {
        id: `route-${r.id}`,
        city: r.name || (from && to ? `${from} → ${to}` : from || to || 'Drive'),
        startDate: r.departDate!,
        endDate: arr && arr.date !== r.departDate ? arr.date : null,
        type: 'travel',
        tags,
        locked: true,
        source: 'route' as const,
        time: r.departTime,
        completed: doneSet.has(`route-${r.id}`),
      };
    });
  const stops = [...stayStops, ...extraStops, ...routeStops];

  const nextOrder = () => (extras.reduce((m, s) => Math.max(m, s.order), 0) + 1);

  async function saveStop(id: string, p: StopPatch) {
    const existing = extras.find(s => s.id === id);
    await put<TimelineStop>({
      kind: 'timelinestop', id,
      city: p.city, startDate: p.startDate, endDate: p.endDate, type: p.type, tags: p.tags,
      order: existing?.order ?? nextOrder(),
      updatedAt: '', updatedBy: '',
    }, `Updated timeline stop: ${p.city}`, 'update');
  }
  async function addStop(p: StopPatch) {
    await put<TimelineStop>({
      kind: 'timelinestop', id: crypto.randomUUID(),
      city: p.city, startDate: p.startDate, endDate: p.endDate, type: p.type, tags: p.tags,
      order: nextOrder(), updatedAt: '', updatedBy: '',
    }, `Added timeline stop: ${p.city}`, 'create');
  }
  async function reorder(ids: string[]) {
    if (!trip) return;
    await put<TripMeta>({ ...trip, timelineOrder: ids }, ids.length ? 'Reordered the timeline' : 'Reset timeline to date order', 'update');
  }
  async function toggleComplete(id: string) {
    if (!trip) return;
    const cur = trip.timelineCompleted ?? [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    await put<TripMeta>({ ...trip, timelineCompleted: next }, 'Updated timeline progress', 'update');
  }

  const subtitle = stops.length
    ? `${stops.length} stop${stops.length === 1 ? '' : 's'} · ${stayStops.length} from stays`
    : 'Sketch your route, city by city';

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Timeline" subtitle={subtitle}
        gradient="linear-gradient(135deg,#13595C,#DDA53A)" icon="🧭" />
      <div className="px-1 py-3">
        <TripTimeline
          stops={stops}
          legend={legend}
          order={trip?.timelineOrder}
          onReorder={reorder}
          onToggleComplete={toggleComplete}
          onSaveStop={saveStop}
          onAddStop={addStop}
          onDeleteStop={id => { const s = extras.find(x => x.id === id); if (s) remove('timelinestop', id, `Removed timeline stop: ${s.city}`); }}
          onSaveLegend={i => put<TimelineLegendItem>(i, `Updated timeline type: ${i.label}`, 'update')}
          onAddLegend={i => put<TimelineLegendItem>(i, `Added timeline type: ${i.label}`, 'create')}
          onDeleteLegend={id => { const l = legend.find(x => x.id === id); if (l) remove('timelinelegend', id, `Removed timeline type: ${l.label}`); }}
        />
      </div>
    </div>
  );
}
