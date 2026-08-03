import { useEffect, useRef, useState, useMemo } from 'react';
import {
  MapPin, Plus, X, Trash2, Navigation, Loader2, RefreshCw, Coins, Route as RouteIcon,
  CornerDownRight, Repeat, Pencil, Check, Clock, GripVertical,
} from 'lucide-react';
import { useFuelRoutes, useTrip, useTravelers, authorColor } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { FuelRoute, FuelWaypoint, EconomyUnit, FuelType, Expense } from '../../types';
import { money1, CURRENCY_SYMBOLS } from '../../types';
import { todayStr } from '../../utils/format';
import { convert } from '../../lib/currency';
import {
  toL100, defaultEconomyFor, PRICE_UNITS, perLitreFrom, perUnitFrom,
  litresUsed, fuelCost, FUEL_TYPES, countryAt, livePrice, type PriceUnit,
  isElectric, isEnergyUnit, unitsForFuel, unitLabel, adjustForYear,
} from '../../lib/fuel';
import type { CarModel } from '../../lib/cars';
import { roadDistanceKm, googleMapsDirections, optimizeRoute, driveDuration, arrivalDateTime, type RoutePoint } from '../../lib/route';
import { fmtDate, fmtTime } from '../../utils/format';
import { carById, carEconomy } from '../../lib/cars';
import { TabHeader, Sheet, Field, TextInput, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { CarNameInput } from '../CarNameInput';

const KM_PER_MI = 1.609344;
const openExternal = (url: string) => window.open(url, '_blank', 'noopener');
const hasCoords = (w: FuelWaypoint) => Number.isFinite(w.lat) && Number.isFinite(w.lng);
const fuelMeta = (k: FuelType) => FUEL_TYPES.find(f => f.key === k)!;

export function FuelTab() {
  const routes = useFuelRoutes();
  const travelers = useTravelers();
  const trip = useTrip();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FuelRoute | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FuelRoute | null>(null);
  const cur = trip?.tripCurrency ?? 'EUR';

  // Press-and-hold a card to edit/delete or drag it to reorder (like Stays).
  const listRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startY: number; moved: boolean } | null>(null);

  function beginDrag(id: string, e: React.PointerEvent) { drag.current = { id, startY: e.clientY, moved: false }; }
  useEffect(() => {
    function move(e: PointerEvent) {
      const d = drag.current; if (!d) return;
      if (!d.moved && Math.abs(e.clientY - d.startY) > 6) { d.moved = true; setDragId(d.id); }
    }
    function up(e: PointerEvent) {
      const d = drag.current; drag.current = null;
      if (d && d.moved) { commitDrop(d.id, e.clientY); setDragId(null); }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

  function commitDrop(id: string, clientY: number) {
    const cards = Array.from(listRef.current?.querySelectorAll('[data-fuel]') ?? []) as HTMLElement[];
    const centers = cards.map(c => { const b = c.getBoundingClientRect(); return { id: c.dataset.fuel!, mid: b.top + b.height / 2 }; });
    let idx = centers.findIndex(c => clientY < c.mid);
    if (idx === -1) idx = centers.length;
    const ids = routes.map(r => r.id);
    const cur = ids.indexOf(id);
    if (idx > cur) idx -= 1;
    if (idx === cur) return;
    ids.splice(cur, 1); ids.splice(idx, 0, id);
    ids.forEach((rid, i) => {
      const r = routes.find(x => x.id === rid);
      if (r && r.order !== i) put<FuelRoute>({ ...r, order: i }, 'Reordered routes', 'update');
    });
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Fuel & Driving" subtitle="Plan a route, estimate the fuel cost"
        gradient="linear-gradient(135deg,#0f766e,#14b8a6)" icon="⛽" />

      <div className="px-4 py-4">
        {routes.length === 0 ? (
          <EmptyState emoji="🛣️" title="No routes yet"
            hint="Add a start, destination and any stops to estimate the fuel cost of the drive." />
        ) : (
          <>
            {routes.length > 1 && <p className="text-[11px] text-slate-400 text-center mb-2">Press &amp; hold a route to edit, delete or drag it</p>}
            <div ref={listRef} className="space-y-3">
              {routes.map(r => (
                <RouteCard key={r.id} r={r} tripCur={cur} dragging={dragId === r.id} author={authorColor(travelers, r)}
                  onEdit={() => setEditing(r)} onDelete={() => setPendingDelete(r)} onDragStart={e => beginDrag(r.id, e)} />
              ))}
            </div>
          </>
        )}
      </div>

      <Fab onClick={() => setAdding(true)} label="Plan a drive" />

      {(adding || editing) && (
        <RouteSheet route={editing} tripCur={cur} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.name || 'this route'}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('fuelroute', pendingDelete.id, `Removed route: ${pendingDelete.name}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

/** Live cost for a saved route from its stored figures. Energy is litres for
 *  liquid fuels, kWh for electric — the maths is identical either way. */
function costOf(r: FuelRoute, tripCur: string) {
  const total = r.distanceKm * (r.roundTrip ? 2 : 1);
  const energy100 = toL100(r.economy, r.economyUnit);
  const litres = litresUsed(total, energy100);
  const priceCost = fuelCost(total, energy100, r.pricePerLiter);
  return { total, litres, priceCost, tripCost: convert(priceCost, r.priceCurrency, tripCur) };
}

function RouteCard({ r, tripCur, dragging, author, onEdit, onDelete, onDragStart }: {
  r: FuelRoute; tripCur: string; dragging: boolean; author?: string;
  onEdit: () => void; onDelete: () => void; onDragStart: (e: React.PointerEvent) => void;
}) {
  const { total, litres, priceCost, tripCost } = costOf(r, tripCur);
  const [logged, setLogged] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  function clearTimer() { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }
  function onDown(e: React.PointerEvent) {
    if (armed) { onDragStart(e); return; }        // armed → dragging reorders
    start.current = { x: e.clientX, y: e.clientY };
    held.current = false;
    clearTimer();
    timer.current = window.setTimeout(() => { held.current = true; setArmed(true); }, 450);
  }
  function onMove(e: React.PointerEvent) {
    if (armed || !start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clearTimer();
  }
  function onUp() { clearTimer(); start.current = null; }
  useEffect(() => clearTimer, []);

  async function addExpense() {
    await put<Expense>({
      kind: 'expense', id: crypto.randomUUID(),
      title: `Fuel — ${r.name || 'drive'}`,
      amount: Math.round(priceCost * 100) / 100, currency: r.priceCurrency, category: 'transport',
      date: todayStr(), paidBy: null, place: '',
      notes: `${r.vehicle ? r.vehicle + ' · ' : ''}${Math.round(total)} km${r.roundTrip ? ' round trip' : ''}`,
      updatedAt: '', updatedBy: '',
    }, `Added fuel expense: ${r.name || 'drive'}`, 'create');
    setLogged(true);
  }
  const from = r.waypoints[0]?.label || 'Start';
  const to = r.waypoints[r.waypoints.length - 1]?.label || 'Destination';
  const stops = Math.max(0, r.waypoints.length - 2);
  const arr = r.departTime ? arrivalDateTime(r.departDate || todayStr(), r.departTime, r.durationMin || 0) : null;
  return (
    <div data-fuel={r.id}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      onClick={() => { if (held.current) { held.current = false; return; } if (armed) setArmed(false); }}
      className={`rounded-2xl border bg-surface shadow-sm overflow-hidden transition ${armed ? 'border-teal-400 ring-2 ring-teal-400/50 animate-wiggle' : 'border-line'} ${dragging ? 'opacity-60 scale-[1.02]' : ''}`}
      style={{ touchAction: 'pan-y' }}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-content flex items-center gap-1.5">
              <span>{fuelMeta(r.fuelType).emoji}</span>
              <span className="truncate" style={{ color: author }}>{r.name || 'Drive'}</span>
              {r.roundTrip && <Repeat size={14} className="text-teal-500 flex-shrink-0" />}
            </p>
            <p className="text-[12px] text-muted mt-0.5 truncate">
              {shortPlace(from)} → {shortPlace(to)}{stops > 0 ? ` · ${stops} stop${stops > 1 ? 's' : ''}` : ''}
            </p>
            {r.vehicle && <p className="text-[11px] text-muted mt-0.5 truncate">🚗 {r.year ? `${r.year} ` : ''}{r.vehicle}</p>}
            {r.departTime && (
              <p className="text-[12px] font-semibold text-teal-600 mt-1 flex items-center gap-1">
                <Clock size={12} /> {fmtTime(r.departTime)}{arr ? ` → ${fmtTime(arr.time)}` : ''}
                {r.departDate ? <span className="text-muted font-normal">· {fmtDate(r.departDate)}{arr && arr.date !== r.departDate ? ` → ${fmtDate(arr.date)}` : ''}</span> : null}
              </p>
            )}
          </div>
          {armed ? (
            <div className="flex items-center gap-1.5 flex-shrink-0" data-no-drag>
              <span className="text-slate-300" aria-hidden><GripVertical size={16} /></span>
              <button onClick={ev => { ev.stopPropagation(); setArmed(false); onEdit(); }} aria-label="Edit route"
                className="w-9 h-9 rounded-full bg-teal-500 text-white flex items-center justify-center shadow active:scale-90"><Pencil size={16} /></button>
              <button onClick={ev => { ev.stopPropagation(); setArmed(false); onDelete(); }} aria-label="Delete route"
                className="w-9 h-9 rounded-full bg-red-50 text-sunset flex items-center justify-center active:scale-90"><Trash2 size={16} /></button>
            </div>
          ) : null}
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Distance" value={`${Math.round(total)} km`} sub={`${Math.round(total / KM_PER_MI)} mi`} />
          {isElectric(r.fuelType)
            ? <Stat label="Energy" value={`${litres.toFixed(1)} kWh`} />
            : <Stat label="Fuel" value={`${litres.toFixed(1)} L`} sub={`${(litres / 3.785411784).toFixed(1)} gal`} />}
          <Stat label="Cost" value={money1(tripCost, tripCur)} sub={r.priceCurrency !== tripCur ? money1(priceCost, r.priceCurrency) : undefined} accent />
        </div>
        {tripCost > 0 && (
          <button data-no-drag onClick={ev => { ev.stopPropagation(); if (armed) { setArmed(false); return; } addExpense(); }} disabled={logged}
            className={`w-full mt-2.5 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 border transition ${
              logged ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-line text-slate-600 active:bg-slate-50'}`}>
            {logged ? <><Check size={14} /> Added to expenses</> : <><Coins size={14} /> Add to expenses</>}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl py-1.5 ${accent ? 'bg-teal-50' : 'bg-slate-50'}`}>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">{label}</p>
      <p className={`font-bold text-sm ${accent ? 'text-teal-700' : 'text-content'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

const shortPlace = (s: string) => s.split(',')[0].trim();

/* ── Editor ──────────────────────────────────────────────────────── */
function RouteSheet({ route, tripCur, onClose }: { route: FuelRoute | null; tripCur: string; onClose: () => void }) {
  const travelers = useTravelers();
  const [name, setName] = useState(route?.name ?? '');
  const [waypoints, setWaypoints] = useState<FuelWaypoint[]>(
    route?.waypoints?.length ? route.waypoints : [emptyWp(), emptyWp()]);
  const [roundTrip, setRoundTrip] = useState(route?.roundTrip ?? false);
  const [economyUnit, setEconomyUnit] = useState<EconomyUnit>(route?.economyUnit ?? 'l100');
  const [economy, setEconomy] = useState(String(route?.economy ?? defaultEconomyFor(route?.economyUnit ?? 'l100')));
  const [fuelType, setFuelType] = useState<FuelType>(route?.fuelType ?? 'petrol');
  const [vehicle, setVehicle] = useState(route?.vehicle ?? '');
  const [modelId, setModelId] = useState(''); // selected preset, '' = custom
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(route?.year ?? thisYear));

  // The right display unit for a fuel: kWh units for electric, litre/MPG units
  // for liquid — keeping the user's chosen liquid unit where it still applies.
  const unitFor = (f: FuelType, cur: EconomyUnit): EconomyUnit =>
    isElectric(f) ? 'kwh100' : (isEnergyUnit(cur) ? 'l100' : cur);

  // A model's economy for a fuel + unit + model year, as a display string.
  const econFor = (c: CarModel, f: FuelType, u: EconomyUnit, yr: string): string => {
    const adj = adjustForYear(carEconomy(c, f), parseInt(yr) || thisYear, isElectric(f));
    return String(round2(fromL100(adj, u)));
  };

  function pickModel(id: string) {
    setModelId(id);
    const c = carById(id);
    if (!c) { setVehicle(''); return; }
    const u = unitFor(c.fuel, economyUnit);
    setFuelType(c.fuel);
    setEconomyUnit(u);
    setEconomy(econFor(c, c.fuel, u, year));
    setVehicle(`${c.make} ${c.model}`);
  }

  // Switching fuel type re-reads the picked model's economy for that fuel (so a
  // model's diesel variant swaps in its lower consumption), and flips the unit
  // between litres and kWh for electric.
  function changeFuel(f: FuelType) {
    setFuelType(f);
    const u = unitFor(f, economyUnit);
    setEconomyUnit(u);
    const c = carById(modelId);
    const fits = c && (c.fuel === f || (!isElectric(f) && !isElectric(c.fuel)));
    if (fits) setEconomy(econFor(c!, f, u, year));
    else { setEconomy(String(defaultEconomyFor(u))); setModelId(''); }
  }

  // Changing the year re-estimates a picked model's economy for that year.
  function changeYear(y: string) {
    setYear(y);
    const c = carById(modelId);
    if (c) setEconomy(econFor(c, fuelType, economyUnit, y));
  }
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('liter');
  const [priceCurrency, setPriceCurrency] = useState(route?.priceCurrency ?? tripCur);
  // Price is edited in the chosen price-unit; convert to/from per-litre for storage.
  const [priceInput, setPriceInput] = useState(route ? String(round3(perUnitFrom(route.pricePerLiter, 'liter'))) : '');
  const [priceSource, setPriceSource] = useState(route?.priceSource ?? '');
  const [priceBusy, setPriceBusy] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(route?.distanceKm ?? null);
  const [durationMin, setDurationMin] = useState<number | null>(route?.durationMin ?? null);
  const [distSource, setDistSource] = useState<'road' | 'estimate' | null>(route ? 'road' : null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [departDate, setDepartDate] = useState(route?.departDate ?? '');
  const [departTime, setDepartTime] = useState(route?.departTime ?? '');

  const routable = waypoints.filter(hasCoords);
  const canRoute = routable.length >= 2;
  const elec = isElectric(fuelType);

  // Canonical price per energy unit: per litre for liquid fuel, per kWh for electric.
  const pricePerLitre = elec ? (parseFloat(priceInput) || 0) : perLitreFrom(parseFloat(priceInput) || 0, priceUnit);
  const l100 = toL100(parseFloat(economy) || 0, economyUnit); // energy per 100 km (L or kWh)

  const result = useMemo(() => {
    if (distanceKm == null) return null;
    const total = distanceKm * (roundTrip ? 2 : 1);
    const litres = litresUsed(total, l100);
    const priceCost = fuelCost(total, l100, pricePerLitre);
    const tripCost = convert(priceCost, priceCurrency, tripCur);
    return { total, litres, priceCost, tripCost };
  }, [distanceKm, roundTrip, l100, pricePerLitre, priceCurrency, tripCur]);

  function setWp(i: number, w: FuelWaypoint) { setWaypoints(ws => ws.map((x, j) => j === i ? w : x)); }
  function addStop() { setWaypoints(ws => [...ws.slice(0, -1), emptyWp(), ws[ws.length - 1]]); }
  function removeWp(i: number) { setWaypoints(ws => ws.filter((_, j) => j !== i)); }

  async function calc() {
    if (!canRoute) return;
    setCalcBusy(true);
    const pts: RoutePoint[] = routable.map(w => ({ label: w.label, lat: w.lat, lng: w.lng }));
    if (roundTrip) pts.push(pts[0]); // close the loop for an accurate return leg
    const r = await roadDistanceKm(pts);
    // We store the one-way base; round trip is applied when displaying.
    setDistanceKm(roundTrip ? r.km / 2 : r.km);
    setDurationMin(roundTrip ? Math.round(r.durationMin / 2) : r.durationMin);
    setDistSource(r.source);
    setCalcBusy(false);
  }

  function optimize() {
    // Keep the start fixed, reorder the middle stops + destination for the
    // shortest path, then recalc.
    const pts = routable.map(w => ({ label: w.label, lat: w.lat, lng: w.lng }));
    if (pts.length < 3) return;
    const ordered = optimizeRoute(pts.slice(1), pts[0]);
    const byLabel = new Map(waypoints.map(w => [w.label, w] as const));
    setWaypoints(ordered.map(p => byLabel.get(p.label) ?? { label: p.label, lat: p.lat, lng: p.lng }));
    setDistanceKm(null); setDurationMin(null); setDistSource(null);
  }

  async function autoPrice() {
    const dest = routable[routable.length - 1];
    if (!dest) return;
    setPriceBusy(true);
    const cc = await countryAt(dest.lat, dest.lng);
    const p = await livePrice(dest.lat, dest.lng, cc, fuelType);
    setPriceCurrency(p.currency);
    setPriceUnit('liter');
    setPriceInput(String(round3(p.pricePerLiter)));
    setPriceSource(p.source);
    setPriceBusy(false);
  }

  async function save() {
    await put<FuelRoute>({
      kind: 'fuelroute', id: route?.id ?? crypto.randomUUID(),
      name: name.trim() || defaultName(waypoints),
      waypoints, roundTrip, vehicle: vehicle || undefined, year: parseInt(year) || undefined,
      economy: parseFloat(economy) || 0, economyUnit, fuelType,
      pricePerLiter: pricePerLitre, priceCurrency, priceSource,
      distanceKm: distanceKm ?? 0, durationMin: durationMin ?? undefined,
      departDate: departDate || undefined, departTime: departTime || undefined, notes: '',
      updatedAt: '', updatedBy: '',
    }, `${route ? 'Updated' : 'Added'} route: ${name.trim() || defaultName(waypoints)}`, route ? 'update' : 'create');
    onClose();
  }

  return (
    <Sheet title={route ? 'Edit route' : 'Plan a drive'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel={route ? 'Save' : 'Save route'} disabled={!canRoute} />}>

      <Field label="Name"><TextInput autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Airport → hotel run" /></Field>

      {/* Waypoints */}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Route</p>
      <div className="space-y-2 mb-2">
        {waypoints.map((w, i) => {
          const role = i === 0 ? 'Start' : i === waypoints.length - 1 ? 'Destination' : `Stop ${i}`;
          const mid = i > 0 && i < waypoints.length - 1;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 flex-shrink-0 flex justify-center text-slate-400">
                {i === 0 ? <Navigation size={16} /> : i === waypoints.length - 1 ? <MapPin size={16} /> : <CornerDownRight size={15} />}
              </span>
              <div className="flex-1 min-w-0">
                <PlaceInput value={w.label}
                  onChange={v => setWp(i, { ...w, label: v, lat: NaN, lng: NaN })}
                  onPick={(c, label) => setWp(i, { label, lat: c?.lat ?? NaN, lng: c?.lng ?? NaN })}
                  placeholder={role} />
              </div>
              {mid && (
                <button onClick={() => removeWp(i)} aria-label="Remove stop"
                  className="p-1.5 rounded-lg text-slate-400 active:bg-red-50 flex-shrink-0"><X size={16} /></button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={addStop} className="text-sm font-semibold text-teal-600 flex items-center gap-1 px-2 py-1 rounded-lg active:bg-teal-50">
          <Plus size={15} /> Add stop
        </button>
        {routable.length >= 3 && (
          <button onClick={optimize} className="text-sm font-semibold text-slate-500 flex items-center gap-1 px-2 py-1 rounded-lg active:bg-slate-100">
            <RouteIcon size={15} /> Optimise order
          </button>
        )}
      </div>

      <label className="flex items-center justify-between py-2 mb-1">
        <span className="text-sm font-medium text-content flex items-center gap-2"><Repeat size={16} className="text-slate-400" /> Round trip (return to start)</span>
        <input type="checkbox" checked={roundTrip} onChange={e => { setRoundTrip(e.target.checked); }} className="w-5 h-5 accent-teal-600" />
      </label>

      {/* Vehicle */}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 mt-2">Vehicle</p>
      <Field label="Car model (optional)">
        <CarNameInput value={vehicle}
          onChange={v => { setVehicle(v); setModelId(''); }}
          onPick={c => pickModel(c.id)}
          placeholder="Type a make or model — e.g. Golf, Tesla, RAV4"
          meta={c => `${econLabel(carEconomy(c, c.fuel), unitFor(c.fuel, economyUnit))} · ${c.region === 'eu' ? 'EU' : 'NA'}`} />
        {vehicle && !modelId && <p className="text-[11px] text-muted mt-1">Custom vehicle — set the economy below, or pick a match above.</p>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={elec ? 'Energy use' : 'Fuel economy'}><TextInput type="number" inputMode="decimal" value={economy} onChange={e => { setEconomy(e.target.value); setModelId(''); }} placeholder="0" /></Field>
        <Field label="Units">
          <Select value={economyUnit} onChange={e => {
            const u = e.target.value as EconomyUnit;
            // Re-express the same real economy in the new unit so the number stays sensible.
            const cur = parseFloat(economy);
            if (Number.isFinite(cur) && cur > 0) setEconomy(String(round2(fromL100(toL100(cur, economyUnit), u))));
            setEconomyUnit(u);
          }}>
            {unitsForFuel(fuelType).map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year">
          <Select value={year} onChange={e => changeYear(e.target.value)}>
            {Array.from({ length: thisYear - 2004 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="Fuel type">
          <Select value={fuelType} onChange={e => changeFuel(e.target.value as FuelType)}>
            {FUEL_TYPES.map(f => <option key={f.key} value={f.key}>{f.emoji} {f.label}</option>)}
          </Select>
        </Field>
      </div>
      {modelId && <p className="text-[11px] text-muted -mt-1 mb-2">Economy estimated for a {year} {vehicle}. Edit the figure if you know it exactly.</p>}

      {/* Price */}
      <div className="flex items-center justify-between mb-1.5 mt-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{elec ? 'Electricity price' : 'Fuel price'}</p>
        <button onClick={autoPrice} disabled={!canRoute || priceBusy}
          className="text-xs font-bold text-teal-600 flex items-center gap-1 disabled:opacity-40">
          {priceBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Auto-fill
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Price"><TextInput type="number" inputMode="decimal" value={priceInput} onChange={e => { setPriceInput(e.target.value); setPriceSource('manual'); }} placeholder="0.00" /></Field>
        <Field label="Per">
          {elec ? (
            <div className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500">per kWh</div>
          ) : (
            <Select value={priceUnit} onChange={e => setPriceUnit(e.target.value as PriceUnit)}>
              {PRICE_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Currency">
          <Select value={priceCurrency} onChange={e => setPriceCurrency(e.target.value)}>
            {currencyOptions(priceCurrency).map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      {priceSource && (
        <p className="text-[11px] text-muted -mt-1 mb-3">
          {priceSource === 'manual' ? 'Your price.'
            : priceSource.endsWith('live') ? `Live local price (${priceSource.replace(' live', '')}). Tweak if the pump differs.`
            : priceSource.includes('elec') ? 'Estimated public-charging rate. Edit to your charger’s price for accuracy.'
            : `Estimated average (${priceSource.replace(' avg', '').replace('world', 'global')}). Edit to today's price for accuracy.`}
        </p>
      )}

      {/* Departure — enables an arrival estimate and puts the drive on the timeline */}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 mt-1">Departure <span className="normal-case font-normal text-slate-400">(optional)</span></p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Date"><TextInput type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} /></Field>
        <Field label="Time"><TextInput type="time" value={departTime} onChange={e => setDepartTime(e.target.value)} /></Field>
      </div>

      {/* Calculate + result */}
      <button onClick={calc} disabled={!canRoute || calcBusy}
        className="w-full mt-1 mb-3 py-3 rounded-2xl font-bold text-white bg-teal-600 active:scale-[0.98] disabled:opacity-40 transition flex items-center justify-center gap-2">
        {calcBusy ? <Loader2 size={17} className="animate-spin" /> : <RouteIcon size={17} />}
        {distanceKm == null ? 'Calculate distance & cost' : 'Recalculate'}
      </button>
      {!canRoute && <p className="text-[11px] text-amber-600 -mt-2 mb-3">Pick a start and destination from the search to calculate.</p>}

      {result && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-3.5 mb-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Distance" value={`${Math.round(result.total)} km`} sub={`${Math.round(result.total / KM_PER_MI)} mi${distSource === 'estimate' ? ' · est.' : ''}`} />
            {elec
              ? <Stat label="Energy" value={`${result.litres.toFixed(1)} kWh`} />
              : <Stat label="Fuel" value={`${result.litres.toFixed(1)} L`} sub={`${(result.litres / 3.785411784).toFixed(1)} gal`} />}
            <Stat label="Cost" value={money1(result.tripCost, tripCur)} sub={priceCurrency !== tripCur ? money1(result.priceCost, priceCurrency) : undefined} accent />
          </div>
          {durationMin != null && (() => {
            const total = durationMin * (roundTrip ? 2 : 1);
            const arr = arrivalDateTime(departDate || todayStr(), departTime, durationMin);
            return (
              <div className="grid grid-cols-2 gap-2 text-center mt-2 pt-2 border-t border-teal-200/70">
                <Stat label={roundTrip ? 'Drive time (both ways)' : 'Drive time'} value={driveDuration(total)} />
                <Stat label="Arrival"
                  value={arr ? fmtTime(arr.time) : '—'}
                  sub={arr && departDate && arr.date !== departDate ? fmtDate(arr.date) : (arr ? undefined : 'set a time')} />
              </div>
            );
          })()}
          {travelers.length > 1 && (
            <p className="text-center text-xs text-teal-700 font-semibold mt-2 flex items-center justify-center gap-1">
              <Coins size={12} /> {money1(result.tripCost / travelers.length, tripCur)} each · {travelers.length} travellers
            </p>
          )}
          {canRoute && (
            <button onClick={() => openExternal(googleMapsDirections(routable.map(w => ({ label: w.label, lat: w.lat, lng: w.lng })), 'driving'))}
              className="w-full mt-2.5 py-2 rounded-xl text-sm font-semibold text-teal-700 bg-white border border-teal-200 active:bg-teal-50 flex items-center justify-center gap-1.5">
              <Navigation size={14} /> Open route in Maps
            </button>
          )}
          {distSource === 'estimate' && (
            <p className="text-[11px] text-muted text-center mt-2">Road router unavailable — distance is a straight-line estimate (+30%).</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */
const emptyWp = (): FuelWaypoint => ({ label: '', lat: NaN, lng: NaN });
const round2 = (n: number) => Math.round(n * 100) / 100;
/** A car's economy shown in the given unit, e.g. "5.9 L/100 km" / "16 kWh/100 km". */
function econLabel(l100: number, unit: EconomyUnit): string {
  const v = fromL100(l100, unit);
  return `${Math.round(v * 10) / 10} ${unitLabel(unit)}`;
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Inverse of toL100 — express canonical energy/100km (L or kWh) in another unit. */
function fromL100(l100: number, unit: EconomyUnit): number {
  if (!(l100 > 0)) return 0;
  switch (unit) {
    case 'l100':   return l100;
    case 'kml':    return 100 / l100;
    case 'mpgus':  return 235.214583 / l100;
    case 'mpguk':  return 282.480936 / l100;
    case 'kwh100': return l100;
    case 'mikwh':  return 100 / (l100 * 1.609344);
  }
}
function defaultName(ws: FuelWaypoint[]): string {
  const a = ws[0]?.label ? shortPlace(ws[0].label) : 'Start';
  const b = ws[ws.length - 1]?.label ? shortPlace(ws[ws.length - 1].label) : 'Destination';
  return `${a} → ${b}`;
}
function currencyOptions(current: string): string[] {
  const base = [...Object.keys(CURRENCY_SYMBOLS),
    'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'MXN', 'BRL', 'ARS', 'CLP',
    'JPY', 'KRW', 'CNY', 'INR', 'THB', 'SGD', 'MYR', 'IDR', 'AED', 'SAR', 'ZAR', 'NZD'];
  return Array.from(new Set([current, ...base]));
}
