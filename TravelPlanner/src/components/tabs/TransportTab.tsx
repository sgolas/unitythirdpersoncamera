import { useState } from 'react';
import { Trash2, ArrowRight } from 'lucide-react';
import { useTransport, useTrip } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { Transport, TransportMode } from '../../types';
import { money } from '../../types';
import { fmtDate, fmtTime, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';

const MODES: { key: TransportMode; label: string; emoji: string }[] = [
  { key: 'flight',   label: 'Flight',   emoji: '✈️' },
  { key: 'train',    label: 'Train',    emoji: '🚆' },
  { key: 'bus',      label: 'Bus',      emoji: '🚌' },
  { key: 'car',      label: 'Car',      emoji: '🚗' },
  { key: 'ferry',    label: 'Ferry',    emoji: '⛴️' },
  { key: 'transfer', label: 'Transfer', emoji: '🚕' },
  { key: 'other',    label: 'Other',    emoji: '🧭' },
];
const modeMeta = (k: TransportMode) => MODES.find(m => m.key === k)!;

export function TransportTab() {
  const legs = useTransport();
  const trip = useTrip();
  const cur = trip?.tripCurrency ?? 'EUR';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transport | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transport | null>(null);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Transport" subtitle={`${legs.length} legs booked`}
        gradient="linear-gradient(135deg,#0284c7,#38bdf8)" icon="✈️" />

      {legs.length === 0 ? (
        <EmptyState emoji="✈️" title="No transport yet" hint="Add flights, trains, ferries & transfers" />
      ) : (
        <div className="px-4 py-4 space-y-3">
          {legs.map(l => {
            const m = modeMeta(l.mode);
            return (
              <div key={l.id} onClick={() => setEditing(l)}
                className="bg-white rounded-2xl p-4 shadow-sm group active:bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">{m.emoji} {m.label.toUpperCase()}{l.provider ? ` · ${l.provider}` : ''}</span>
                  <button onClick={ev => { ev.stopPropagation(); setPendingDelete(l); }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50">
                    <Trash2 size={14} className="text-slate-300 hover:text-sunset" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{l.fromPlace || '—'}</p>
                    <p className="text-xs text-slate-400">{fmtDate(l.departDate)}{l.departTime ? ` · ${fmtTime(l.departTime)}` : ''}</p>
                  </div>
                  <ArrowRight size={18} className="text-sky flex-shrink-0" />
                  <div className="flex-1 text-right">
                    <p className="font-bold text-slate-800">{l.toPlace || '—'}</p>
                    <p className="text-xs text-slate-400">{l.arriveDate ? fmtDate(l.arriveDate) : ''}{l.arriveTime ? ` · ${fmtTime(l.arriveTime)}` : ''}</p>
                  </div>
                </div>
                {(l.confirmation || l.seat || l.cost > 0) && (
                  <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    {l.confirmation && <span>🎫 {l.confirmation}</span>}
                    {l.seat && <span>💺 {l.seat}</span>}
                    {l.cost > 0 && <span className="ml-auto font-semibold text-slate-700">{money(l.cost, l.costCurrency ?? cur)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add transport" />

      {(adding || editing) && (
        <TransportSheet leg={editing} currency={cur} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`${modeMeta(pendingDelete.mode).label} ${pendingDelete.fromPlace} → ${pendingDelete.toPlace}`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('transport', pendingDelete.id, `Removed ${pendingDelete.mode}: ${pendingDelete.fromPlace} → ${pendingDelete.toPlace}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

/** From/To suggestions are limited to real travel hubs, matched to the mode:
 *  flights search airports, trains search train stations, and so on. */
const HUB_TAGS: Partial<Record<TransportMode, string[]>> = {
  flight: ['aeroway:aerodrome'],
  train:  ['railway:station'],
  bus:    ['amenity:bus_station', 'railway:station'],
  ferry:  ['amenity:ferry_terminal'],
};
const DEFAULT_HUBS = ['aeroway:aerodrome', 'railway:station']; // car / transfer / other
const hubPlaceholder = (mode: TransportMode) =>
  mode === 'flight' ? 'Search airports…'
  : mode === 'train' ? 'Search train stations…'
  : mode === 'bus' ? 'Search bus/train stations…'
  : mode === 'ferry' ? 'Search ferry terminals…'
  : 'Search airports / stations…';

function TransportSheet({ leg, currency, onClose }: { leg: Transport | null; currency: string; onClose: () => void }) {
  const [mode, setMode] = useState<TransportMode>(leg?.mode ?? 'flight');
  const [provider, setProvider] = useState(leg?.provider ?? '');
  const [fromPlace, setFrom] = useState(leg?.fromPlace ?? '');
  const [toPlace, setTo] = useState(leg?.toPlace ?? '');
  // Exact positions from the search picker — lets the map pin hubs precisely.
  const [fromCoord, setFromCoord] = useState<{ lat: number; lng: number } | null>(
    leg?.fromLat != null && leg?.fromLng != null ? { lat: leg.fromLat, lng: leg.fromLng } : null);
  const [toCoord, setToCoord] = useState<{ lat: number; lng: number } | null>(
    leg?.toLat != null && leg?.toLng != null ? { lat: leg.toLat, lng: leg.toLng } : null);
  const [departDate, setDepartDate] = useState(leg?.departDate ?? todayStr());
  const [departTime, setDepartTime] = useState(leg?.departTime ?? '');
  const [arriveDate, setArriveDate] = useState(leg?.arriveDate ?? '');
  const [arriveTime, setArriveTime] = useState(leg?.arriveTime ?? '');
  const [confirmation, setConfirmation] = useState(leg?.confirmation ?? '');
  const [seat, setSeat] = useState(leg?.seat ?? '');
  const [cost, setCost] = useState(leg ? String(leg.cost || '') : '');
  const [costCurrency, setCostCurrency] = useState(leg?.costCurrency ?? currency);
  const [notes, setNotes] = useState(leg?.notes ?? '');

  async function save() {
    if (!fromPlace.trim() || !toPlace.trim()) return;
    const isNew = !leg;
    await put<Transport>({
      kind: 'transport', id: leg?.id ?? crypto.randomUUID(),
      mode, provider: provider.trim(), fromPlace: fromPlace.trim(), toPlace: toPlace.trim(),
      fromLat: fromCoord?.lat ?? null, fromLng: fromCoord?.lng ?? null,
      toLat: toCoord?.lat ?? null, toLng: toCoord?.lng ?? null,
      departDate, departTime, arriveDate, arriveTime,
      confirmation: confirmation.trim(), seat: seat.trim(),
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(),
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} ${mode}: ${fromPlace.trim()} → ${toPlace.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={leg ? 'Edit transport' : 'Add transport'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!fromPlace.trim() || !toPlace.trim()} submitLabel={leg ? 'Save' : 'Add'} />}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mode">
          <Select value={mode} onChange={e => setMode(e.target.value as TransportMode)}>
            {MODES.map(m => <option key={m.key} value={m.key}>{m.emoji} {m.label}</option>)}
          </Select>
        </Field>
        <Field label="Provider"><TextInput value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. Delta" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><PlaceInput value={fromPlace}
          onChange={v => { setFrom(v); setFromCoord(null); }}
          onPick={c => setFromCoord(c)}
          placeholder={hubPlaceholder(mode)} osmTags={HUB_TAGS[mode] ?? DEFAULT_HUBS} /></Field>
        <Field label="To"><PlaceInput value={toPlace}
          onChange={v => { setTo(v); setToCoord(null); }}
          onPick={c => setToCoord(c)}
          placeholder={hubPlaceholder(mode)} osmTags={HUB_TAGS[mode] ?? DEFAULT_HUBS} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Depart date"><TextInput type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} /></Field>
        <Field label="Depart time"><TextInput type="time" value={departTime} onChange={e => setDepartTime(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Arrive date"><TextInput type="date" value={arriveDate} onChange={e => setArriveDate(e.target.value)} /></Field>
        <Field label="Arrive time"><TextInput type="time" value={arriveTime} onChange={e => setArriveTime(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Confirmation"><TextInput value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Booking ref" /></Field>
        <Field label="Seat"><TextInput value={seat} onChange={e => setSeat(e.target.value)} placeholder="Optional" /></Field>
      </div>
      <CostField value={cost} onChange={setCost} currency={costCurrency} onCurrencyChange={setCostCurrency} />
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Sheet>
  );
}
