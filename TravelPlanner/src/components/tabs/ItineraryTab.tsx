import { useState, useMemo } from 'react';
import { MapPin, Clock, CalendarDays, Wallet, FileText } from 'lucide-react';
import { useItinerary, useTrip, useTransport, useAccommodation, useCarRentals, useTravelers, authorColor } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { ItineraryEvent } from '../../types';
import { AddressText } from '../AddressText';
import { money } from '../../types';
import { convert } from '../../lib/currency';
import { fmtDate, fmtTime, fmtDateLong, dateRange, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { ReorderProvider, HoldCard, HoldHint, DetailSheet, DocField, type DetailRow } from '../cardKit';
import { DocViewer } from '../DocViewer';

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

const MODE_EMOJI: Record<string, string> = { flight: '✈️', train: '🚆', bus: '🚌', car: '🚗', ferry: '⛴️', transfer: '🚐', other: '📍' };

/** A normalised entry in the "All Events" trip timeline. */
type TimelineNav = 'transport' | 'accommodation' | 'carrental';
type TL = {
  id: string; date: string; time: string; emoji: string; color: string;
  title: string; sub?: string; cost?: number; costCur?: string;
  ev?: ItineraryEvent;   // itinerary items open the editor
  nav?: TimelineNav;     // logistics items jump to their tab
};

export function ItineraryTab({ onNavigate }: { onNavigate?: (v: TimelineNav) => void } = {}) {
  const events = useItinerary();
  const transport = useTransport();
  const stays = useAccommodation();
  const cars = useCarRentals();
  const travelers = useTravelers();
  const trip = useTrip();
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = todayStr();
    if (trip && today < trip.startDate) return trip.startDate;
    if (trip && today > trip.endDate) return trip.startDate;
    return today;
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ItineraryEvent | null>(null);
  const [viewing, setViewing] = useState<ItineraryEvent | null>(null);
  const [pdfView, setPdfView] = useState<{ name: string; mime?: string; dataUrl: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ItineraryEvent | null>(null);
  const [mode, setMode] = useState<'day' | 'all'>('day');

  function reorderDay(ids: string[]) {
    ids.forEach((id, i) => { const e = events.find(x => x.id === id); if (e && e.order !== i) put<ItineraryEvent>({ ...e, order: i }, 'Reordered itinerary', 'update'); });
  }

  const cur = trip?.tripCurrency ?? 'EUR';
  const days = trip ? dateRange(trip.startDate, trip.endDate) : [];
  const dayEvents = events.filter(e => e.date === selectedDate);
  const dayCost = dayEvents.reduce((s, e) => s + convert(e.cost || 0, e.costCurrency ?? cur, cur), 0);

  // "All Events": a full trip timeline — activities + flights/trains, hotel
  // check-in/out, and car pick-up/drop-off — grouped by date, ordered by time.
  const timeline = useMemo(() => {
    const items: TL[] = [];
    for (const e of events) if (e.date) {
      const m = catMeta(e.category as Cat);
      items.push({ id: 'i' + e.id, date: e.date, time: e.startTime || '', emoji: m.emoji, color: m.color, title: e.title, sub: e.place, cost: e.cost, costCur: e.costCurrency, ev: e });
    }
    for (const t of transport) if (t.departDate) {
      const name = t.flightNumber ? ` ${t.flightNumber}` : t.provider ? ` · ${t.provider}` : '';
      items.push({ id: 't' + t.id, date: t.departDate, time: t.departTime || '', emoji: MODE_EMOJI[t.mode] || '✈️', color: '#38bdf8', title: `${t.mode[0].toUpperCase()}${t.mode.slice(1)}${name}`, sub: [t.fromPlace, t.toPlace].filter(Boolean).join(' → '), cost: t.cost, costCur: t.costCurrency, nav: 'transport' });
    }
    for (const s of stays) {
      if (s.checkIn) items.push({ id: 'sci' + s.id, date: s.checkIn, time: '', emoji: '🏨', color: '#a78bfa', title: `Check in · ${s.name}`, sub: s.city, cost: s.cost, costCur: s.costCurrency, nav: 'accommodation' });
      if (s.checkOut) items.push({ id: 'sco' + s.id, date: s.checkOut, time: '', emoji: '🏨', color: '#a78bfa', title: `Check out · ${s.name}`, sub: s.city, nav: 'accommodation' });
    }
    for (const cr of cars) {
      if (cr.pickupDate) items.push({ id: 'cpu' + cr.id, date: cr.pickupDate, time: cr.pickupTime || '', emoji: '🚗', color: '#22c55e', title: `Pick up car · ${cr.company}`, sub: cr.pickupLocation, cost: cr.cost, costCur: cr.costCurrency, nav: 'carrental' });
      if (cr.dropoffDate) items.push({ id: 'cdo' + cr.id, date: cr.dropoffDate, time: cr.dropoffTime || '', emoji: '🚗', color: '#22c55e', title: `Drop off car · ${cr.company}`, sub: cr.dropoffLocation, nav: 'carrental' });
    }
    const by = new Map<string, TL[]>();
    for (const it of items) (by.get(it.date) ?? by.set(it.date, []).get(it.date)!).push(it);
    for (const [, arr] of by) arr.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, transport, stays, cars]);

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
            <div className="px-4 py-2">
              <HoldHint count={dayEvents.length} />
              <ReorderProvider ids={dayEvents.map(e => e.id)} onReorder={reorderDay} className="space-y-2">
                {dayEvents.map(ev => <EventCard key={ev.id} ev={ev} cur={cur} author={authorColor(travelers, ev)}
                  onView={() => setViewing(ev)} onEdit={() => setEditing(ev)} onDelete={() => setPendingDelete(ev)} />)}
              </ReorderProvider>
            </div>
          )}
        </>
      ) : (
        /* All Events — the whole trip in one list: activities, transport,
           stays and car rentals, ordered by date & time */
        timeline.length === 0 ? (
          <EmptyState emoji="🗓️" title="Nothing planned yet" hint="Add activities, flights, stays or cars — they all show here" />
        ) : (
          <div className="px-4 py-3 space-y-4">
            {timeline.map(([date, items]) => {
              const sum = items.reduce((s, it) => s + convert(it.cost || 0, it.costCur ?? cur, cur), 0);
              return (
                <div key={date}>
                  <div className="flex items-center justify-between px-1 mb-1.5">
                    <h3 className="font-bold text-slate-700 text-sm">{fmtDateLong(date)}</h3>
                    {sum > 0 && <span className="text-xs font-semibold text-amber bg-amber-50 px-2 py-0.5 rounded-full">{money(sum, cur)}</span>}
                  </div>
                  <div className="space-y-2">
                    {items.map(it => (
                      <TimelineCard key={it.id} it={it} cur={cur}
                        onTap={() => { if (it.ev) setViewing(it.ev); else if (it.nav) onNavigate?.(it.nav); }} />
                    ))}
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
      {viewing && (() => {
        const m = catMeta(viewing.category as Cat);
        const rows: DetailRow[] = [
          { icon: <CalendarDays size={16} />, label: 'When', value: `${fmtDate(viewing.date)}${viewing.startTime ? ` · ${fmtTime(viewing.startTime)}${viewing.endTime ? ` – ${fmtTime(viewing.endTime)}` : ''}` : ''}` },
          { icon: <MapPin size={16} />, label: 'Location', value: viewing.place ? <AddressText address={viewing.place} /> : '' },
          { label: 'Category', value: `${m.emoji} ${m.label}` },
          { icon: <Wallet size={16} />, label: 'Cost', value: viewing.cost > 0 ? money(viewing.cost, viewing.costCurrency ?? cur) : '' },
          { icon: <FileText size={16} />, label: 'Notes', value: viewing.notes },
        ];
        return (
          <DetailSheet title={`${m.emoji} ${viewing.title}`} rows={rows}
            file={viewing.fileData} fileName={viewing.fileName}
            onViewDoc={() => viewing.fileData && setPdfView({ name: viewing.fileName || 'document.pdf', mime: viewing.fileMime, dataUrl: viewing.fileData })}
            note="Press & hold the event in the day list to edit or delete it."
            onClose={() => setViewing(null)} />
        );
      })()}
      {pdfView && <DocViewer name={pdfView.name} mime={pdfView.mime} dataUrl={pdfView.dataUrl} onClose={() => setPdfView(null)} />}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.title}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('itinerary', pendingDelete.id, `Removed event: ${pendingDelete.title}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function TimelineCard({ it, cur, onTap }: { it: TL; cur: string; onTap: () => void }) {
  return (
    <div onClick={onTap} className="bg-white rounded-2xl shadow-sm flex overflow-hidden active:bg-slate-50">
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: it.color }} />
      <div className="flex-1 p-3.5 min-w-0">
        <p className="font-semibold text-slate-800">{it.emoji} {it.title}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
          {it.time && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(it.time)}</span>}
          {it.sub && <span className="flex items-center gap-1 min-w-0"><MapPin size={11} className="flex-shrink-0" /><span className="truncate">{it.sub}</span></span>}
          {it.cost ? <span className="font-semibold text-amber">{money(it.cost, it.costCur ?? cur)}</span> : null}
        </div>
      </div>
    </div>
  );
}

function EventCard({ ev, cur, author, onView, onEdit, onDelete }: { ev: ItineraryEvent; cur: string; author?: string; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const m = catMeta(ev.category as Cat);
  return (
    <HoldCard id={ev.id} accent={m.color} hasDoc={!!ev.fileData} onView={onView} onEdit={onEdit} onDelete={onDelete}
      className="!p-0 overflow-hidden flex">
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: m.color }} />
      <div className="flex-1 p-3.5 min-w-0">
        <p className="font-semibold text-slate-800 pr-16" style={{ color: author }}>{m.emoji} {ev.title}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
          {(ev.startTime || ev.endTime) && (
            <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(ev.startTime)}{ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}</span>
          )}
          {ev.place && <span className="flex items-center gap-1"><MapPin size={11} />{ev.place}</span>}
          {ev.cost > 0 && <span className="font-semibold text-amber">{money(ev.cost, ev.costCurrency ?? cur)}</span>}
        </div>
        {ev.notes && <p className="text-xs text-slate-400 mt-1.5">{ev.notes}</p>}
      </div>
    </HoldCard>
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
  const [file, setFile] = useState({ data: event?.fileData, name: event?.fileName, mime: event?.fileMime });

  async function save() {
    if (!title.trim()) return;
    const isNew = !event;
    await put<ItineraryEvent>({
      kind: 'itinerary', id: event?.id ?? crypto.randomUUID(),
      title: title.trim(), date, startTime, endTime, place: place.trim(), category,
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(),
      order: event?.order, fileData: file.data, fileName: file.name, fileMime: file.mime,
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
      <DocField file={file.data} fileName={file.name}
        onPick={(data, name, mime) => setFile({ data, name, mime })} onClear={() => setFile({ data: undefined, name: undefined, mime: undefined })} />
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Sheet>
  );
}
