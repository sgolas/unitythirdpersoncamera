import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MapPin, Ticket, Armchair, Wallet, FileText } from 'lucide-react';
import { useTransport, useTrip, useTravelers, authorColor } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { Transport, TransportMode } from '../../types';
import { AddressText } from '../AddressText';
import { money } from '../../types';
import { fmtDate, fmtTime, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { ReorderProvider, HoldCard, HoldHint, DetailSheet, DocField, type DetailRow } from '../cardKit';
import { DocViewer } from '../DocViewer';
import { watchableFlights, getFlightStatuses, statusKey, statusLabel, lookupFlight, type FlightStatus } from '../../lib/flightStatus';
import { PLACES_ENDPOINT } from '../../lib/config';
import { Search, Loader } from 'lucide-react';

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

const TONE_CLS = {
  ok:   'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad:  'bg-rose-50 text-rose-700',
};

export function TransportTab() {
  const legs = useTransport();
  const travelers = useTravelers();
  const trip = useTrip();
  const cur = trip?.tripCurrency ?? 'EUR';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transport | null>(null);
  const [viewing, setViewing] = useState<Transport | null>(null);
  const [pdfView, setPdfView] = useState<{ name: string; mime?: string; dataUrl: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transport | null>(null);
  const [statuses, setStatuses] = useState<Record<string, FlightStatus>>({});

  function reorder(ids: string[]) {
    ids.forEach((id, i) => { const l = legs.find(x => x.id === id); if (l && l.order !== i) put<Transport>({ ...l, order: i }, 'Reordered transport', 'update'); });
  }

  // Live status for flights departing soon (needs a flight number set).
  const watchCount = watchableFlights(legs).length;
  useEffect(() => {
    if (watchCount === 0) return;
    let alive = true;
    getFlightStatuses(watchableFlights(legs)).then(s => { if (alive) setStatuses(s); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchCount]);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Transport" subtitle={`${legs.length} legs booked`}
        gradient="linear-gradient(135deg,#0284c7,#38bdf8)" icon="✈️" />

      {legs.length === 0 ? (
        <EmptyState emoji="✈️" title="No transport yet" hint="Add flights, trains, ferries & transfers" />
      ) : (
        <div className="px-4 py-4">
          <HoldHint count={legs.length} />
          <ReorderProvider ids={legs.map(l => l.id)} onReorder={reorder} className="space-y-3">
            {legs.map(l => {
              const m = modeMeta(l.mode);
              const st = l.mode === 'flight' && l.flightNumber ? statuses[statusKey(l)] : undefined;
              const lab = st ? statusLabel(st) : null;
              return (
                <HoldCard key={l.id} id={l.id} accent="#0284c7" hasDoc={!!l.fileData}
                  onView={() => setViewing(l)} onEdit={() => setEditing(l)} onDelete={() => setPendingDelete(l)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400">
                      {m.emoji} {m.label.toUpperCase()}{l.flightNumber ? ` ${l.flightNumber.toUpperCase()}` : ''}{l.provider ? ` · ${l.provider}` : ''}
                      {lab && <span className={`ml-2 px-2 py-0.5 rounded-full font-bold ${TONE_CLS[lab.tone]}`}>{lab.text}</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-slate-800" style={{ color: authorColor(travelers, l) }}>{l.fromPlace || '—'}</p>
                      <p className="text-xs text-slate-400">{fmtDate(l.departDate)}{l.departTime ? ` · ${fmtTime(l.departTime)}` : ''}</p>
                    </div>
                    <ArrowRight size={18} className="text-sky flex-shrink-0" />
                    <div className="flex-1 text-right">
                      <p className="font-bold text-slate-800" style={{ color: authorColor(travelers, l) }}>{l.toPlace || '—'}</p>
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
                </HoldCard>
              );
            })}
          </ReorderProvider>
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add transport" />

      {(adding || editing) && (
        <TransportSheet leg={editing} currency={cur} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {viewing && (() => {
        const m = modeMeta(viewing.mode);
        const rows: DetailRow[] = [
          { icon: <MapPin size={16} />, label: 'From', value: viewing.fromPlace ? <AddressText address={viewing.fromPlace} /> : '' },
          { icon: <MapPin size={16} />, label: 'To', value: viewing.toPlace ? <AddressText address={viewing.toPlace} /> : '' },
          { label: 'Depart', value: `${fmtDate(viewing.departDate)}${viewing.departTime ? ` · ${fmtTime(viewing.departTime)}` : ''}` },
          { label: 'Arrive', value: viewing.arriveDate ? `${fmtDate(viewing.arriveDate)}${viewing.arriveTime ? ` · ${fmtTime(viewing.arriveTime)}` : ''}` : '' },
          { icon: <Ticket size={16} />, label: 'Confirmation', value: viewing.confirmation },
          { icon: <Armchair size={16} />, label: 'Seat', value: viewing.seat },
          { icon: <Wallet size={16} />, label: 'Cost', value: viewing.cost > 0 ? money(viewing.cost, viewing.costCurrency ?? cur) : '' },
          { icon: <FileText size={16} />, label: 'Notes', value: viewing.notes },
        ];
        return (
          <DetailSheet title={`${m.emoji} ${viewing.fromPlace} → ${viewing.toPlace}`}
            subtitle={`${m.label}${viewing.flightNumber ? ` · ${viewing.flightNumber}` : ''}${viewing.provider ? ` · ${viewing.provider}` : ''}`}
            rows={rows} file={viewing.fileData} fileName={viewing.fileName}
            onViewDoc={() => viewing.fileData && setPdfView({ name: viewing.fileName || 'ticket.pdf', mime: viewing.fileMime, dataUrl: viewing.fileData })}
            note="Press & hold the card in the list to edit or delete it."
            onClose={() => setViewing(null)} />
        );
      })()}
      {pdfView && <DocViewer name={pdfView.name} mime={pdfView.mime} dataUrl={pdfView.dataUrl} onClose={() => setPdfView(null)} />}
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
/** Exact map position for an airport label (best effort, via Google search). */
async function resolveAirport(label: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(PLACES_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: label, kind: 'airport' }),
    });
    if (!r.ok) return null;
    const d = await r.json() as { items?: { lat?: number; lng?: number }[] };
    const hit = d.items?.[0];
    return hit && hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng } : null;
  } catch { return null; }
}

const hubPlaceholder = (mode: TransportMode) =>
  mode === 'flight' ? 'Search airports…'
  : mode === 'train' ? 'Search train stations…'
  : mode === 'bus' ? 'Search bus/train stations…'
  : mode === 'ferry' ? 'Search ferry terminals…'
  : 'Search airports / stations…';

function TransportSheet({ leg, currency, onClose }: { leg: Transport | null; currency: string; onClose: () => void }) {
  const [mode, setMode] = useState<TransportMode>(leg?.mode ?? 'flight');
  const [provider, setProvider] = useState(leg?.provider ?? '');
  const [flightNumber, setFlightNumber] = useState(leg?.flightNumber ?? '');
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
  const [file, setFile] = useState({ data: leg?.fileData, name: leg?.fileName, mime: leg?.fileMime });
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');
  // Remembered from the lookup so the arrival date follows whenever the
  // departure date is changed afterwards (+1 for overnight flights).
  const [flightOffset, setFlightOffset] = useState<number | null>(null);
  const autoLooked = useRef('');

  function shiftDate(base: string, days: number): string {
    const d = new Date((base || todayStr()) + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function pickDepartDate(v: string) {
    setDepartDate(v);
    if (flightOffset != null && v) setArriveDate(shiftDate(v, flightOffset));
  }

  /** Fill the form from the flight number: airline, airports, times. */
  async function findFlight() {
    const iata = flightNumber.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{2,3}\d{1,4}$/.test(iata)) { setLookupMsg('Type a flight number first, like AC848.'); return; }
    setLooking(true); setLookupMsg('');
    const info = await lookupFlight(iata);
    setLooking(false);
    if (info === 'not-configured') { setLookupMsg('Flight lookup isn’t set up yet.'); return; }
    if (!info) { setLookupMsg(`Couldn't find ${iata} — check the number, or fill the details in manually.`); return; }

    if (info.airline) setProvider(info.airline);
    const fromLabel = info.from.name ? `${info.from.name}${info.from.iata ? ` (${info.from.iata})` : ''}` : '';
    const toLabel = info.to.name ? `${info.to.name}${info.to.iata ? ` (${info.to.iata})` : ''}` : '';
    if (fromLabel) { setFrom(fromLabel); setFromCoord(null); resolveAirport(fromLabel).then(c => c && setFromCoord(c)); }
    if (toLabel)   { setTo(toLabel);     setToCoord(null);   resolveAirport(toLabel).then(c => c && setToCoord(c)); }
    if (info.depTime) setDepartTime(info.depTime);
    if (info.arrTime) setArriveTime(info.arrTime);
    setFlightOffset(info.dayOffset || 0);
    setArriveDate(shiftDate(departDate, info.dayOffset || 0));
    setLookupMsg(info.depTime
      ? `✓ ${iata}${info.airline ? ` · ${info.airline}` : ''}: ${info.from.iata ?? 'dep'} ${info.depTime} → ${info.to.iata ?? 'arr'} ${info.arrTime ?? '?'}${info.dayOffset ? ` (next day)` : ' (same day)'}. Now pick YOUR depart date below — the arrival date follows it.`
      : `Found the route for ${iata}${info.airline ? ` · ${info.airline}` : ''}, but no times were available — fill those in from your booking.`);
  }

  // Auto-look-up once a full flight number is typed (only while the route
  // fields are still empty, so it never overwrites what you entered).
  useEffect(() => {
    if (mode !== 'flight' || looking) return;
    const iata = flightNumber.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{1,4}$|^[A-Z0-9]{2}\d{2,4}$/.test(iata)) return;
    if (autoLooked.current === iata || fromPlace.trim() || toPlace.trim()) return;
    const t = setTimeout(() => { autoLooked.current = iata; void findFlight(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNumber, mode]);

  async function save() {
    if (!fromPlace.trim() || !toPlace.trim()) return;
    const isNew = !leg;
    await put<Transport>({
      kind: 'transport', id: leg?.id ?? crypto.randomUUID(),
      mode, provider: provider.trim(), flightNumber: flightNumber.replace(/\s+/g, '').toUpperCase() || undefined,
      fromPlace: fromPlace.trim(), toPlace: toPlace.trim(),
      fromLat: fromCoord?.lat ?? null, fromLng: fromCoord?.lng ?? null,
      toLat: toCoord?.lat ?? null, toLng: toCoord?.lng ?? null,
      departDate, departTime, arriveDate, arriveTime,
      confirmation: confirmation.trim(), seat: seat.trim(),
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(),
      order: leg?.order, fileData: file.data, fileName: file.name, fileMime: file.mime,
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
      {mode === 'flight' && (
        <Field label="Flight number (auto-fill + live status)">
          <div className="flex gap-2">
            <div className="flex-1"><TextInput value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="e.g. AC848" /></div>
            <button onClick={findFlight} disabled={looking} aria-label="Find flight"
              className="px-4 rounded-xl font-semibold text-white accent-gradient active:scale-95 disabled:opacity-50 transition flex items-center gap-1.5">
              {looking ? <Loader size={15} className="animate-spin" /> : <Search size={15} />} Find
            </button>
          </div>
          {lookupMsg && <p className="text-xs text-slate-500 mt-1.5">{lookupMsg}</p>}
        </Field>
      )}
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
        <Field label="Depart date"><TextInput type="date" value={departDate} onChange={e => pickDepartDate(e.target.value)} /></Field>
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
      <DocField file={file.data} fileName={file.name}
        onPick={(data, name, mime) => setFile({ data, name, mime })} onClear={() => setFile({ data: undefined, name: undefined, mime: undefined })} />
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Sheet>
  );
}
