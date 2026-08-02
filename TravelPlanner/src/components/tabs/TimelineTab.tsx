/**
 * Trip Timeline tab — wires the reusable <TripTimeline> to the app's store.
 *
 * Overnight stops are derived live from Stays (read-only here); the editable
 * "extra" stops and the legend are their own synced Dexie tables. All edits go
 * through put()/remove() so they log + sync like everything else.
 */
import { useEffect } from 'react';
import { useAccommodation, useTimelineStops, useTimelineLegend } from '../../hooks/useTrip';
import { db, put, remove } from '../../db/database';
import type { TimelineStop, TimelineLegendItem } from '../../types';
import { TabHeader } from '../ui';
import { TripTimeline, SEED_LEGEND, type UnifiedStop, type StopPatch } from '../TripTimeline';

const SEED_FLAG = 'timeline.seeded';

export function TimelineTab() {
  const stays = useAccommodation();
  const extras = useTimelineStops();
  const legend = useTimelineLegend();

  // Seed the built-in legend once (overnight / day / end / buffer). Guarded by
  // a flag so we don't recreate it after the user clears the list.
  useEffect(() => {
    if (localStorage.getItem(SEED_FLAG)) return;
    (async () => {
      const count = await db.timelinelegend.count();
      if (count === 0) {
        for (const l of SEED_LEGEND) {
          await put<TimelineLegendItem>({ ...l, id: crypto.randomUUID() }, `Added timeline type: ${l.label}`, 'create');
        }
      }
      localStorage.setItem(SEED_FLAG, '1');
    })();
  }, []);

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
    }));
  const extraStops: UnifiedStop[] = extras.map(s => ({
    id: s.id, city: s.city, startDate: s.startDate, endDate: s.endDate,
    type: s.type, tags: s.tags, locked: false, source: 'extra' as const,
  }));
  const stops = [...stayStops, ...extraStops];

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
  async function reorderStop(id: string, startDate: string, endDate: string | null, order: number) {
    const s = extras.find(x => x.id === id); if (!s) return;
    await put<TimelineStop>({ ...s, startDate, endDate, order }, `Moved timeline stop: ${s.city}`, 'update');
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
          onSaveStop={saveStop}
          onAddStop={addStop}
          onDeleteStop={id => { const s = extras.find(x => x.id === id); if (s) remove('timelinestop', id, `Removed timeline stop: ${s.city}`); }}
          onReorderStop={reorderStop}
          onSaveLegend={i => put<TimelineLegendItem>(i, `Updated timeline type: ${i.label}`, 'update')}
          onAddLegend={i => put<TimelineLegendItem>(i, `Added timeline type: ${i.label}`, 'create')}
          onDeleteLegend={id => { const l = legend.find(x => x.id === id); if (l) remove('timelinelegend', id, `Removed timeline type: ${l.label}`); }}
        />
      </div>
    </div>
  );
}
