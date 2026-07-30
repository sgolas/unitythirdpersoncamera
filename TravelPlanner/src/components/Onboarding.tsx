import { useState } from 'react';
import { Plane, Plus, X, Check, QrCode, Loader } from 'lucide-react';
import { put } from '../db/database';
import type { TripMeta, Traveler } from '../types';
import { CURRENCY_SYMBOLS } from '../types';
import { setHomeCurrency, setAwayCurrency } from '../lib/currency';
import { ensureSyncCredentials } from '../lib/config';
import { scanToJoin, joinByCode } from '../lib/join';
import { isNative } from '../lib/platform';
import { todayStr } from '../utils/format';
import { Field, TextInput, Select } from './ui';

const EMOJIS = ['🧑', '👩', '👨', '🧒', '👧', '👦', '👴', '👵', '🧕', '🧑‍🦱', '🧑‍🦰', '👶'];

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Row { name: string; role: 'adult' | 'child'; emoji: string }

/**
 * First-run wizard. Shown by App when no trip exists yet. Collects the trip
 * basics + travellers + currencies, writes them locally, and hands control
 * back to the app (the live query picks up the new trip and renders it).
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const today = todayStr();
  const [name, setName] = useState('');
  const [destinations, setDestinations] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 14));
  const [home, setHome] = useState('CAD');
  const [away, setAway] = useState('EUR');
  const [rows, setRows] = useState<Row[]>([{ name: '', role: 'adult', emoji: '🧑' }]);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinPass, setJoinPass] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);
  const [joinCodeErr, setJoinCodeErr] = useState('');

  async function join() {
    setJoining(true); setJoinErr('');
    const res = await scanToJoin();
    if (res.ok) { onDone(); return; } // synced trip now exists → app renders it
    setJoinErr(res.message);
    setJoining(false);
  }

  async function joinCodeSubmit() {
    setJoiningCode(true); setJoinCodeErr('');
    const res = await joinByCode(joinCode, joinPass);
    if (res.ok) { onDone(); return; } // synced trip now exists → app renders it
    setJoinCodeErr(res.message);
    setJoiningCode(false);
  }

  const namedRows = rows.filter(r => r.name.trim());
  const datesOk = startDate <= endDate;
  const canCreate = name.trim() && namedRows.length > 0 && datesOk;

  function setRow(i: number, patch: Partial<Row>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRow() { setRows(rs => [...rs, { name: '', role: 'adult', emoji: '🧑' }]); }
  function removeRow(i: number) { setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs); }

  async function create() {
    if (!canCreate || saving) return;
    setSaving(true);
    // Currency preference drives the dual-currency display everywhere.
    setHomeCurrency(home);
    setAwayCurrency(away);
    // Give the trip a sync identity up front so Sync + Share just work.
    ensureSyncCredentials();

    await put<TripMeta>({
      kind: 'trip', id: 'trip',
      name: name.trim(),
      destinations: destinations.trim(),
      startDate, endDate,
      homeCurrency: home, tripCurrency: away,
      totalBudget: 0, notes: '',
      updatedAt: '', updatedBy: '',
    }, `Created trip: ${name.trim()}`, 'create');

    for (const r of namedRows) {
      await put<Traveler>({
        kind: 'traveler', id: crypto.randomUUID(),
        name: r.name.trim(), role: r.role, emoji: r.emoji,
        updatedAt: '', updatedBy: '',
      }, `Added traveller: ${r.name.trim()}`, 'create');
    }
    onDone();
  }

  return (
    <div className="min-h-screen bg-bg text-content">
      {/* Hero */}
      <div className="relative overflow-hidden text-white bg-monogram"
        style={{ background: 'linear-gradient(150deg, var(--hero-1), var(--hero-2) 55%, var(--hero-3))' }}>
        <div className="absolute -right-6 top-3 text-[110px] opacity-10 select-none pointer-events-none">🌍</div>
        <div className="px-6 pad-header-top pb-8 relative">
          <span className="inline-flex items-center gap-2 text-white/70 text-xs font-semibold tracking-wide uppercase">
            <Plane size={14} /> Trip Planner
          </span>
          <h1 className="text-[1.8rem] leading-tight font-extrabold mt-2">Let's set up your trip</h1>
          <p className="text-white/70 text-sm mt-1.5">Takes about 30 seconds. Everything stays on your device — you can add sharing later.</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-md mx-auto" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Join an existing trip via QR (native) */}
        {isNative && (
          <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
            <p className="font-semibold text-content mb-0.5">Invited to a trip?</p>
            <p className="text-xs text-muted mb-3">Scan the QR from whoever set it up to join and sync with the group.</p>
            <button onClick={join} disabled={joining}
              className="w-full py-2.5 rounded-2xl font-semibold text-white bg-accent active:scale-[0.98] disabled:opacity-50 transition flex items-center justify-center gap-2">
              {joining ? <><Loader size={16} className="animate-spin" /> Joining…</> : <><QrCode size={16} /> Scan a QR to join</>}
            </button>
            {joinErr && <p className="text-sunset text-sm mt-2">{joinErr}</p>}
            <p className="text-[11px] text-muted mt-2 text-center">or set up your own trip below</p>
          </div>
        )}

        {/* Join an existing trip by code (desktop / web — no camera to scan) */}
        {!isNative && (
          <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
            <p className="font-semibold text-content mb-0.5">Already have a trip?</p>
            <p className="text-xs text-muted mb-3">Enter your trip code and password to load it here and sync — or paste an invite link.</p>
            <Field label="Trip code or invite link">
              <TextInput value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="e.g. trip-abcdef-ghij" autoCapitalize="none" />
            </Field>
            <Field label="Password">
              <TextInput type="password" value={joinPass} onChange={e => setJoinPass(e.target.value)} placeholder="Shared password" />
            </Field>
            <button onClick={joinCodeSubmit} disabled={joiningCode || !joinCode.trim()}
              className="w-full py-2.5 rounded-2xl font-semibold text-white bg-accent active:scale-[0.98] disabled:opacity-50 transition flex items-center justify-center gap-2">
              {joiningCode ? <><Loader size={16} className="animate-spin" /> Loading…</> : <><Check size={16} /> Load my trip</>}
            </button>
            {joinCodeErr && <p className="text-sunset text-sm mt-2">{joinCodeErr}</p>}
            <p className="text-[11px] text-muted mt-2 text-center">or set up a new trip below</p>
          </div>
        )}

        {/* Basics */}
        <div className="bg-surface rounded-2xl p-4 shadow-soft border border-line">
          <Field label="Trip name"><TextInput autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Europe 2026" /></Field>
          <Field label="Destinations (optional)"><TextInput value={destinations} onChange={e => setDestinations(e.target.value)} placeholder="France · Italy · Spain" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date"><TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
            <Field label="End date"><TextInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
          </div>
          {!datesOk && <p className="text-sunset text-xs -mt-1">End date can't be before the start date.</p>}
        </div>

        {/* Travellers */}
        <div className="bg-surface rounded-2xl p-4 shadow-soft border border-line">
          <p className="font-semibold text-content mb-1">Who's coming?</p>
          <p className="text-xs text-muted mb-3">Add everyone on the trip. You can add profile pictures later in Settings.</p>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <select value={r.emoji} onChange={e => setRow(i, { emoji: e.target.value })}
                  className="w-14 h-[46px] rounded-xl border border-slate-200 bg-slate-50 text-xl text-center">
                  {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                </select>
                <div className="flex-1">
                  <TextInput value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder={i === 0 ? 'You' : 'Name'} />
                </div>
                <select value={r.role} onChange={e => setRow(i, { role: e.target.value as 'adult' | 'child' })}
                  className="h-[46px] rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm">
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                </select>
                <button onClick={() => removeRow(i)} disabled={rows.length <= 1} aria-label="Remove"
                  className="h-[46px] px-2 text-slate-300 hover:text-sunset disabled:opacity-30">
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addRow}
            className="w-full mt-3 py-2.5 rounded-xl font-semibold text-accent border-2 border-dashed border-line active:bg-slate-50 flex items-center justify-center gap-1.5">
            <Plus size={16} /> Add person
          </button>
        </div>

        {/* Currencies */}
        <div className="bg-surface rounded-2xl p-4 shadow-soft border border-line">
          <p className="font-semibold text-content mb-1">Currencies</p>
          <p className="text-xs text-muted mb-3">Amounts show in both — your home currency and the one you'll spend in.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Home currency">
              <Select value={home} onChange={e => setHome(e.target.value)}>
                {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c].trim()}</option>)}
              </Select>
            </Field>
            <Field label="Spending currency">
              <Select value={away} onChange={e => setAway(e.target.value)}>
                {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c].trim()}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </div>

      {/* Sticky create button */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pt-3 bg-gradient-to-t from-bg via-bg to-transparent"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={create} disabled={!canCreate || saving}
          className="w-full py-3.5 rounded-2xl font-bold text-white bg-ink active:scale-[0.98] disabled:opacity-40 transition flex items-center justify-center gap-2">
          {saving ? 'Creating…' : <><Check size={18} /> Create my trip</>}
        </button>
      </div>
    </div>
  );
}
