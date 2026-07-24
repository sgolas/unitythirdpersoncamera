import { useState, useMemo } from 'react';
import { Trash2, MapPin, Clock } from 'lucide-react';
import { useItinerary, useTrip } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { ItineraryEvent } from '../../types';
import { money } from '../../types';
import { convert } from '../../lib/currency';
import { fmtDate, fmtTime, fmtDateLong, dateRange, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';

const CATS = [
  { key: 'sightseeing', label: 'Sightseeing', emoji: '📸', color: '#a78bfa' },
  { key: 'food',        label: 'Food',        emoji: '🍽️', color: '#fb7185' },
  { key: 'travel',      label: 'Travel',      emoji: '🚆', color: '#38bdf8' },
  { key: 'rest',        label: 'Rest',        emoji: '😴', color: '#94a3b8' },
  { key: 'event',       label: 'Event',       emoji: '🎫', color: '#34d399' },
  { key: 'other',       label: 'Other',       emoji: '📍', color: '#f59e0b' },
] as const;
type Cat = typeof CATS[number]['key'];
const catMeta = (k: Cat) => CATS.find(c => c.key === k)!;

export function ItineraryTab() {
  const events = useItinerary();
  const trip = useTrip();
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = todayStr();
    if (trip && today < trip.startDate) return trip.startDate;
    if (trip && today > trip.endDate) return trip.startDate;
    return today;
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ItineraryEvent | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ItineraryEvent | null>(null);
  const [mode, setMode] = useState<'day' | 'all'>('day');

  const cur = trip?.tripCurrency ?? 'EUR';
  const days = trip ? dateRange(trip.startDate, trip.endDate) : [];
  const dayEvents = events.filter(e => e.date === selectedDate);
  const dayCost = dayEvents.reduce((s, e) => s + convert(e.cost || 0, e.costCurrency ?? cur, cur), 0);

  // "All" view: every event grouped by date, in chronological order.
  const groups = useMemo(() => {
    const by = new Map<string, ItineraryEvent[]>();
    for (const e of events) { const k = e.date || 'No date'; (by.get(k) ?? by.set(k, []).get(k)!).push(e); }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Itinerary" subtitle={trip ? `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}` : ''}
        gradient="linear-gradient(135deg,#6d28d9,#a78bfa)" icon="🗓️" />

      {/* Day / All toggle */}
      <div className="px-4 pt-3 pb-1">
        <div className="inline-flex bg-slate-100 rounded-xl p-0.5">
          {(['day', 'all'] as const).map(mo => (
            <button key={mo} onClick={() => setMode(mo)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition ${mode === mo ? 'bg-white text-grape shadow-sm' : 'text-slate-500'}`}>
              {mo === 'day' ? 'By day' : 'All events'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'day' ? (
        <>
          {/* day strip */}
          {days.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 bg-white border-b border-slate-100">
              {days.map(d => {
                const active = d === selectedDate;
                const count = events.filter(e => e.date === d).length;
                const dt = new Date(d + 'T00:00:00');
                return (
                  <button key={d} onClick={() => setSelectedDate(d)}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-2xl transition ${
                      active ? 'bg-grape text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <span className="text-[10px] font-semibold uppercase">{dt.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="text-base font-bold">{dt.getDate()}</span>
                    {count > 0 && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${active ? 'bg-white' : 'bg-grape'}`} />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-5 pt-4 pb-1 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">{fmtDateLong(selectedDate)}</h2>
            {dayCost > 0 && (
              <span className="text-sm font-semibold text-amber bg-amber-50 px-2.5 py-1 rounded-full">{money(dayCost, cur)}</span>
            )}
          </div>

          {dayEvents.length === 0 ? (
            <EmptyState emoji="🗓️" title="Nothing planned" hint="Add activities for this day" />
          ) : (
            <div className="px-4 py-2 space-y-2">
              {dayEvents.map(ev => <EventCard key={ev.id} ev={ev} cur={cur} onEdit={() => setEditing(ev)} onDelete={() => setPendingDelete(ev)} />)}
            </div>
          )}
        </>
      ) : (
        /* All events — every item in one list, ordered by date */
        events.length === 0 ? (
          <EmptyState emoji="🗓️" title="Nothing planned yet" hint="Tap + to add your first activity" />
        ) : (
          <div className="px-4 py-3 space-y-4">
            {groups.map(([date, evs]) => {
              const sum = evs.reduce((s, e) => s + convert(e.cost || 0, e.costCurrency ?? cur, cur), 0);
              return (
                <div key={date}>
                  <div className="flex items-center justify-between px-1 mb-1.5">
                    <h3 className="font-bold text-slate-700 text-sm">{date === 'No date' ? 'No date' : fmtDateLong(date)}</h3>
                    {sum > 0 && <span className="text-xs font-semibold text-amber bg-amber-50 px-2 py-0.5 rounded-full">{money(sum, cur)}</span>}
                  </div>
                  <div className="space-y-2">
                    {evs.map(ev => <EventCard key={ev.id} ev={ev} cur={cur} onEdit={() => setEditing(ev)} onDelete={() => setPendingDelete(ev)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <Fab onClick={() => setAdding(true)} label="Add event" />

      {(adding || editing) && (
        <EventSheet event={editing} defaultDate={selectedDate} currency={cur} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.title}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('itinerary', pendingDelete.id, `Removed event: ${pendingDelete.title}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function EventCard({ ev, cur, onEdit, onDelete }: { ev: ItineraryEvent; cur: string; onEdit: () => void; onDelete: () => void }) {
  const m = catMeta(ev.category as Cat);
  return (
    <div onClick={onEdit} className="bg-white rounded-2xl shadow-sm flex overflow-hidden group active:bg-slate-50">
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: m.color }} />
      <div className="flex-1 p-3.5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-800">{m.emoji} {ev.title}</p>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 flex-shrink-0">
            <Trash2 size={14} className="text-slate-300 hover:text-sunset" />
          </button>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
          {(ev.startTime || ev.endTime) && (
            <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(ev.startTime)}{ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}</span>
          )}
          {ev.place && <span className="flex items-center gap-1"><MapPin size={11} />{ev.place}</span>}
          {ev.cost > 0 && <span className="font-semibold text-amber">{money(ev.cost, ev.costCurrency ?? cur)}</span>}
        </div>
        {ev.notes && <p className="text-xs text-slate-400 mt-1.5">{ev.notes}</p>}
      </div>
    </div>
  );
}

function EventSheet({ event, defaultDate, currency, onClose }: { event: ItineraryEvent | null; defaultDate: string; currency: string; onClose: () => void }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(event?.startTime ?? '');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [place, setPlace] = useState(event?.place ?? '');
  const [category, setCategory] = useState<Cat>((event?.category as Cat) ?? 'sightseeing');
  const [cost, setCost] = useState(event ? String(event.cost || '') : '');
  const [costCurrency, setCostCurrency] = useState(event?.costCurrency ?? currency);
  const [notes, setNotes] = useState(event?.notes ?? '');

  async function save() {
    if (!title.trim()) return;
    const isNew = !event;
    await put<ItineraryEvent>({
      kind: 'itinerary', id: event?.id ?? crypto.randomUUID(),
      title: title.trim(), date, startTime, endTime, place: place.trim(), category,
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(),
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} event: ${title.trim()} on ${fmtDate(date)}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={event ? 'Edit event' : 'Add event'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!title.trim()} submitLabel={event ? 'Save' : 'Add event'} />}>
      <Field label="Title"><TextInput autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Louvre Museum" /></Field>
      <Field label="Date"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start"><TextInput type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
        <Field label="End"><TextInput type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></Field>
      </div>
      <Field label="Category">
        <Select value={category} onChange={e => setCategory(e.target.value as Cat)}>
          {CATS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
        </Select>
      </Field>
      <Field label="Location"><PlaceInput value={place} onChange={setPlace} placeholder="Search a location…" /></Field>
      <CostField value={cost} onChange={setCost} currency={costCurrency} onCurrencyChange={setCostCurrency} />
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Sheet>
  );
}
