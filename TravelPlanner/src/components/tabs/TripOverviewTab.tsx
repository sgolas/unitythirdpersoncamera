import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTrip, useTravelers, useExpenses, useTransport, useAccommodation, useItinerary, useChecklist } from '../../hooks/useTrip';
import { put } from '../../db/database';
import type { TripMeta } from '../../types';
import { money, CURRENCY_SYMBOLS, sumExpenses } from '../../types';
import { fmtDateLong, tripLength, daysUntil } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter } from '../ui';

export function TripOverviewTab() {
  const trip = useTrip();
  const travelers = useTravelers();
  const expenses = useExpenses();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const checklist = useChecklist();
  const [editing, setEditing] = useState(false);

  if (!trip) return null;
  const spent = sumExpenses(expenses, trip.tripCurrency);
  const days = daysUntil(trip.startDate);

  const stats = [
    { label: 'Days', value: tripLength(trip.startDate, trip.endDate) },
    { label: 'Travelers', value: travelers.length },
    { label: 'Events', value: itinerary.length },
    { label: 'Transport', value: transport.length },
    { label: 'Stays', value: stays.length },
    { label: 'Tasks done', value: `${checklist.filter(c => c.done).length}/${checklist.length}` },
  ];

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Overview" subtitle={trip.destinations}
        gradient="linear-gradient(135deg,#0284c7,#38bdf8)" icon="🧭" />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm relative">
          <button onClick={() => setEditing(true)} className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 active:bg-slate-200">
            <Pencil size={15} className="text-slate-500" />
          </button>
          <h2 className="text-2xl font-bold text-slate-800">{trip.name}</h2>
          <p className="text-sky font-medium">{trip.destinations}</p>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p>🛫 {fmtDateLong(trip.startDate)}</p>
            <p>🛬 {fmtDateLong(trip.endDate)}</p>
            {days > 0 && <p className="text-slate-400">{days} days until departure</p>}
          </div>
          {trip.notes && <p className="mt-3 text-slate-500 text-sm bg-slate-50 rounded-xl p-3">{trip.notes}</p>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Total spent so far</span>
            <span className="font-bold text-slate-800">{money(spent, trip.tripCurrency)}</span>
          </div>
          {trip.totalBudget > 0 && (
            <div className="flex justify-between mt-1">
              <span className="text-slate-500">Budget</span>
              <span className="font-bold text-slate-800">{money(trip.totalBudget, trip.tripCurrency)}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 mb-2">Who's going</p>
          <div className="flex gap-2 flex-wrap">
            {travelers.map(t => (
              <div key={t.id} className="bg-white rounded-2xl px-4 py-2.5 shadow-sm flex items-center gap-2">
                <span className="text-xl">{t.emoji}</span>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{t.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && <TripSheet trip={trip} onClose={() => setEditing(false)} />}
    </div>
  );
}

function TripSheet({ trip, onClose }: { trip: TripMeta; onClose: () => void }) {
  const [name, setName] = useState(trip.name);
  const [destinations, setDestinations] = useState(trip.destinations);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [tripCurrency, setTripCurrency] = useState(trip.tripCurrency);
  const [homeCurrency, setHomeCurrency] = useState(trip.homeCurrency);
  const [notes, setNotes] = useState(trip.notes);

  async function save() {
    await put<TripMeta>({
      ...trip, name: name.trim(), destinations: destinations.trim(),
      startDate, endDate, tripCurrency, homeCurrency, notes: notes.trim(),
    }, `Updated trip details: ${name.trim()}`);
    onClose();
  }

  return (
    <Sheet title="Edit trip" onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!name.trim()} submitLabel="Save" />}>
      <Field label="Trip name"><TextInput value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Destinations"><TextInput value={destinations} onChange={e => setDestinations(e.target.value)} placeholder="France · Italy · Spain" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start"><TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
        <Field label="End"><TextInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trip currency">
          <Select value={tripCurrency} onChange={e => setTripCurrency(e.target.value)}>
            {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Home currency">
          <Select value={homeCurrency} onChange={e => setHomeCurrency(e.target.value)}>
            {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    </Sheet>
  );
}
