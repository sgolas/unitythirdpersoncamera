import { useState, useMemo } from 'react';
import {
  MapPin, Plus, X, Trash2, Navigation, Loader2, RefreshCw, Coins, Route as RouteIcon,
  CornerDownRight, Repeat, Pencil, Check,
} from 'lucide-react';
import { useFuelRoutes, useTrip, useTravelers } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { FuelRoute, FuelWaypoint, EconomyUnit, FuelType, Expense } from '../../types';
import { money1, CURRENCY_SYMBOLS } from '../../types';
import { todayStr } from '../../utils/format';
import { convert } from '../../lib/currency';
import {
  ECONOMY_UNITS, toL100, defaultEconomyFor, PRICE_UNITS, perLitreFrom, perUnitFrom,
  litresUsed, fuelCost, FUEL_TYPES, countryAt, livePrice, type PriceUnit,
} from '../../lib/fuel';
import { roadDistanceKm, googleMapsDirections, optimizeRoute, type RoutePoint } from '../../lib/route';
import { CAR_MODELS, carById, carEconomy } from '../../lib/cars';
import { TabHeader, Sheet, Field, TextInput, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';
import { PlaceInput } from '../PlaceInput';

const KM_PER_MI = 1.609344;
const openExternal = (url: string) => window.open(url, '_blank', 'noopener');
const hasCoords = (w: FuelWaypoint) => Number.isFinite(w.lat) && Number.isFinite(w.lng);
const fuelMeta = (k: FuelType) => FUEL_TYPES.find(f => f.key === k)!;

export function FuelTab() {
  const routes = useFuelRoutes();
  const trip = useTrip();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FuelRoute | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FuelRoute | null>(null);
  const cur = trip?.tripCurrency ?? 'EUR';

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Fuel & Driving" subtitle="Plan a route, estimate the fuel cost"
        gradient="linear-gradient(135deg,#0f766e,#14b8a6)" icon="⛽" />

      <div className="px-4 py-4">
        {routes.length === 0 ? (
          <EmptyState emoji="🛣️" title="No routes yet"
            hint="Add a start, destination and any stops to estimate the fuel cost of the drive." />
        ) : (
          <div className="space-y-3">
            {routes.map(r => (
              <RouteCard key={r.id} r={r} tripCur={cur} onEdit={() => setEditing(r)} onDelete={() => setPendingDelete(r)} />
            ))}
          </div>
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

/** Live cost for a saved route from its stored figures. */
function costOf(r: FuelRoute, tripCur: string) {
  const total = r.distanceKm * (r.roundTrip ? 2 : 1);
  const l100 = toL100(r.economy, r.economyUnit);
  const litres = litresUsed(total, l100);
  const priceCost = fuelCost(total, l100, r.pricePerLiter);
  return { total, litres, priceCost, tripCost: convert(priceCost, r.priceCurrency, tripCur) };
}

function RouteCard({ r, tripCur, onEdit, onDelete }: { r: FuelRoute; tripCur: string; onEdit: () => void; onDelete: () => void }) {
  const { total, litres, priceCost, tripCost } = costOf(r, tripCur);
  const [logged, setLogged] = useState(false);
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
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-sm overflow-hidden">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-content flex items-center gap-1.5">
              <span>{fuelMeta(r.fuelType).emoji}</span>
              <span className="truncate">{r.name || 'Drive'}</span>
              {r.roundTrip && <Repeat size={14} className="text-teal-500 flex-shrink-0" />}
            </p>
            <p className="text-[12px] text-muted mt-0.5 truncate">
              {shortPlace(from)} → {shortPlace(to)}{stops > 0 ? ` · ${stops} stop${stops > 1 ? 's' : ''}` : ''}
            </p>
            {r.vehicle && <p className="text-[11px] text-muted mt-0.5 truncate">🚗 {r.vehicle}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-muted active:bg-slate-100" aria-label="Edit"><Pencil size={15} /></button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-muted active:bg-red-50" aria-label="Delete"><Trash2 size={15} /></button>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Distance" value={`${Math.round(total)} km`} sub={`${Math.round(total / KM_PER_MI)} mi`} />
          <Stat label="Fuel" value={`${litres.toFixed(1)} L`} sub={`${(litres / 3.785411784).toFixed(1)} gal`} />
          <Stat label="Cost" value={money1(tripCost, tripCur)} sub={r.priceCurrency !== tripCur ? money1(priceCost, r.priceCurrency) : undefined} accent />
        </div>
        {tripCost > 0 && (
          <button onClick={addExpense} disabled={logged}
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

  function pickModel(id: string) {
    setModelId(id);
    const c = carById(id);
    if (!c) { setVehicle(''); return; }
    setFuelType(c.fuel);
    setEconomy(String(round2(fromL100(carEconomy(c, c.fuel), economyUnit))));
    setVehicle(`${c.make} ${c.model}`);
  }

  // Switching fuel type re-reads the picked model's economy for that fuel, so a
  // model's diesel variant swaps in its (lower) consumption automatically.
  function changeFuel(f: FuelType) {
    setFuelType(f);
    const c = carById(modelId);
    if (c) setEconomy(String(round2(fromL100(carEconomy(c, f), economyUnit))));
  }
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('liter');
  const [priceCurrency, setPriceCurrency] = useState(route?.priceCurrency ?? tripCur);
  // Price is edited in the chosen price-unit; convert to/from per-litre for storage.
  const [priceInput, setPriceInput] = useState(route ? String(round3(perUnitFrom(route.pricePerLiter, 'liter'))) : '');
  const [priceSource, setPriceSource] = useState(route?.priceSource ?? '');
  const [priceBusy, setPriceBusy] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(route?.distanceKm ?? null);
  const [distSource, setDistSource] = useState<'road' | 'estimate' | null>(route ? 'road' : null);
  const [calcBusy, setCalcBusy] = useState(false);

  const routable = waypoints.filter(hasCoords);
  const canRoute = routable.length >= 2;

  const pricePerLitre = perLitreFrom(parseFloat(priceInput) || 0, priceUnit);
  const l100 = toL100(parseFloat(economy) || 0, economyUnit);

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
    setDistanceKm(null); setDistSource(null);
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
      waypoints, roundTrip, vehicle: vehicle || undefined,
      economy: parseFloat(economy) || 0, economyUnit, fuelType,
      pricePerLiter: pricePerLitre, priceCurrency, priceSource,
      distanceKm: distanceKm ?? 0, notes: '',
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
        <Select value={modelId} onChange={e => pickModel(e.target.value)}>
          <option value="">{vehicle ? `${vehicle} (custom)` : 'Custom — enter economy below'}</option>
          <optgroup label="Europe — top rentals">
            {CAR_MODELS.filter(c => c.region === 'eu').map(c => (
              <option key={c.id} value={c.id}>{c.make} {c.model} · {econLabel(carEconomy(c, c.fuel), economyUnit)}{c.dieselL100 ? ' · diesel avail.' : ''}</option>
            ))}
          </optgroup>
          <optgroup label="North America — top rentals">
            {CAR_MODELS.filter(c => c.region === 'na').map(c => (
              <option key={c.id} value={c.id}>{c.make} {c.model} · {econLabel(carEconomy(c, c.fuel), economyUnit)}</option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fuel economy"><TextInput type="number" inputMode="decimal" value={economy} onChange={e => { setEconomy(e.target.value); setModelId(''); }} placeholder="0" /></Field>
        <Field label="Units">
          <Select value={economyUnit} onChange={e => {
            const u = e.target.value as EconomyUnit;
            // Re-express the same real economy in the new unit so the number stays sensible.
            const cur = parseFloat(economy);
            if (Number.isFinite(cur) && cur > 0) setEconomy(String(round2(fromL100(toL100(cur, economyUnit), u))));
            setEconomyUnit(u);
          }}>
            {ECONOMY_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Fuel type">
        <Select value={fuelType} onChange={e => changeFuel(e.target.value as FuelType)}>
          {FUEL_TYPES.map(f => <option key={f.key} value={f.key}>{f.emoji} {f.label}</option>)}
        </Select>
      </Field>

      {/* Price */}
      <div className="flex items-center justify-between mb-1.5 mt-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fuel price</p>
        <button onClick={autoPrice} disabled={!canRoute || priceBusy}
          className="text-xs font-bold text-teal-600 flex items-center gap-1 disabled:opacity-40">
          {priceBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Auto-fill
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Price"><TextInput type="number" inputMode="decimal" value={priceInput} onChange={e => { setPriceInput(e.target.value); setPriceSource('manual'); }} placeholder="0.00" /></Field>
        <Field label="Per">
          <Select value={priceUnit} onChange={e => setPriceUnit(e.target.value as PriceUnit)}>
            {PRICE_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
          </Select>
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
            : `Estimated average (${priceSource.replace(' avg', '').replace('world', 'global')}). Edit to today's price for accuracy.`}
        </p>
      )}

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
            <Stat label="Fuel" value={`${result.litres.toFixed(1)} L`} sub={`${(result.litres / 3.785411784).toFixed(1)} gal`} />
            <Stat label="Cost" value={money1(result.tripCost, tripCur)} sub={priceCurrency !== tripCur ? money1(result.priceCost, priceCurrency) : undefined} accent />
          </div>
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
/** A car's economy shown in the user's chosen unit, e.g. "5.9 L/100km" / "40 MPG". */
function econLabel(l100: number, unit: EconomyUnit): string {
  const v = fromL100(l100, unit);
  const u = ECONOMY_UNITS.find(x => x.key === unit)?.label ?? '';
  return `${Math.round(v * 10) / 10} ${u}`;
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Inverse of toL100 — express canonical L/100km in another unit. */
function fromL100(l100: number, unit: EconomyUnit): number {
  if (!(l100 > 0)) return 0;
  switch (unit) {
    case 'l100':  return l100;
    case 'kml':   return 100 / l100;
    case 'mpgus': return 235.214583 / l100;
    case 'mpguk': return 282.480936 / l100;
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
