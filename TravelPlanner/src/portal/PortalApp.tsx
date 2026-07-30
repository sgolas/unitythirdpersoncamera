import { useState, useEffect, useReducer } from 'react';
import { initCurrency } from '../lib/currency';
import { Lock, RefreshCw, Plane, BedDouble, FileText, Wallet, ListChecks, CalendarRange, MapPin, Clock, Compass, Map as MapIcon, Images, Download } from 'lucide-react';
import { pullOnly } from '../db/sync';
import { computeStops, StringMap } from '../components/tripMap';
import { TripLeafletMap } from '../components/TripLeafletMap';
import {
  useTrip, useTravelers, useItinerary, useTransport, useAccommodation,
  useDocuments, useExpenses, useChecklist, useBudget, usePhotos, useMapPins, useSpend,
} from '../hooks/useTrip';
import { money, sumExpenses } from '../types';
import { fmtDate, fmtDateLong, fmtTime, tripLength, daysUntil, dateRange } from '../utils/format';

const SS_CODE = 'portal.code';
const SS_PASS = 'portal.pass';

/** Read credentials from an invite link (#t=code&k=pass) if present. */
function credsFromHash(): { code: string; pass: string } | null {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const p = new URLSearchParams(h);
  const code = p.get('t'); const pass = p.get('k');
  return code && pass ? { code, pass } : null;
}

export function PortalApp() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem(SS_CODE));
  const [booting, setBooting] = useState(!authed && !!credsFromHash());

  // An invite link (#t=…&k=…) signs the viewer straight in — no typing.
  useEffect(() => {
    const c = credsFromHash();
    if (authed || !c) return;
    (async () => {
      const res = await pullOnly(c.code.trim(), c.pass);
      if (res.ok) {
        sessionStorage.setItem(SS_CODE, c.code.trim());
        sessionStorage.setItem(SS_PASS, c.pass);
        setAuthed(true);
      }
      // Clear the secret from the address bar either way.
      history.replaceState(null, '', location.pathname + location.search);
      setBooting(false);
    })();
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white"
        style={{ background: 'linear-gradient(150deg,#0f172a,#1e293b,#334155)' }}>
        <div className="flex items-center gap-3 text-white/80"><RefreshCw size={18} className="animate-spin" /> Opening your trip…</div>
      </div>
    );
  }
  if (!authed) return <PortalLogin onDone={() => setAuthed(true)} />;
  return <PortalView />;
}

function PortalLogin({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function enter() {
    if (!code || !pass) return;
    setBusy(true); setErr('');
    const res = await pullOnly(code.trim(), pass);
    setBusy(false);
    if (!res.ok) { setErr(res.message); return; }
    sessionStorage.setItem(SS_CODE, code.trim());
    sessionStorage.setItem(SS_PASS, pass);
    onDone();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(150deg,#0f172a,#1e293b,#334155)' }}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-ink flex items-center justify-center text-white mx-auto mb-4">
          <Lock size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-800 text-center">Trip Planner Portal</h1>
        <p className="text-slate-400 text-sm text-center mt-1 mb-6">Enter your family trip code to view your plans</p>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase">Family trip code</span>
          <input value={code} onChange={e => setCode(e.target.value)} autoCapitalize="none"
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky outline-none"
            placeholder="e.g. golas-europe-2026" />
        </label>
        <label className="block mb-5">
          <span className="text-xs font-semibold text-slate-500 uppercase">Password</span>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && enter()}
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky outline-none"
            placeholder="Shared password" />
        </label>

        {err && <p className="text-sunset text-sm text-center mb-3">{err}</p>}
        <button onClick={enter} disabled={busy || !code || !pass}
          className="w-full py-3 rounded-2xl font-bold text-white bg-ink active:scale-[0.98] disabled:opacity-40 transition">
          {busy ? 'Loading…' : 'View trip'}
        </button>
        <p className="text-center text-xs text-slate-300 mt-4">View only · changes are made in the app</p>
        <a href="https://github.com/sgolas/sylsrepo/releases/latest/download/TripPlanner-Setup.exe"
          className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-ink transition">
          <Download size={15} /> Download the Windows desktop app
        </a>
      </div>
    </div>
  );
}

function Section({ title, icon, children, count }: { title: string; icon: React.ReactNode; children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className="text-slate-400">{icon}</span>
        <h2 className="font-bold text-slate-700">{title}</h2>
        {count !== undefined && <span className="text-xs text-slate-400">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function PortalView() {
  const trip = useTrip();
  const travelers = useTravelers();
  const itinerary = useItinerary();
  const transport = useTransport();
  const stays = useAccommodation();
  const docs = useDocuments();
  const expenses = useExpenses();
  const allSpend = useSpend();
  const checklist = useChecklist();
  const budget = useBudget();
  const photos = usePhotos();
  const mapPins = useMapPins();
  const [refreshing, setRefreshing] = useState(false);
  const [waited, setWaited] = useState(false);
  const [view, setView] = useState<'overview' | 'map' | 'photos'>('overview');
  const [, bump] = useReducer(x => x + 1, 0);

  useEffect(() => { const t = setTimeout(() => setWaited(true), 1500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    initCurrency();
    const on = () => bump();
    window.addEventListener('cur-change', on);
    return () => window.removeEventListener('cur-change', on);
  }, []);

  async function refresh() {
    setRefreshing(true);
    await pullOnly(sessionStorage.getItem(SS_CODE)!, sessionStorage.getItem(SS_PASS)!);
    setRefreshing(false);
  }

  function backToLogin() {
    sessionStorage.removeItem(SS_CODE);
    sessionStorage.removeItem(SS_PASS);
    location.reload();
  }

  if (!trip) {
    if (!waited) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
    // Code is valid but nothing has been synced from the app yet.
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-4"
        style={{ background: 'linear-gradient(150deg,#0f172a,#1e293b,#334155)' }}>
        <span className="text-5xl">📭</span>
        <h1 className="text-white text-xl font-bold">No trip data yet</h1>
        <p className="text-white/70 text-sm max-w-xs">
          This trip code exists, but nothing has been synced yet. Open the <b>Trip Planner app</b>,
          set the <b>same</b> trip code &amp; password in <b>Sync &amp; Setup</b>, then tap <b>Sync</b>.
        </p>
        <div className="flex gap-3 mt-2">
          <button onClick={refresh} className="px-5 py-2.5 rounded-2xl font-semibold bg-white/15 text-white active:bg-white/25">
            Check again
          </button>
          <button onClick={backToLogin} className="px-5 py-2.5 rounded-2xl font-semibold bg-white text-ink">
            Use another code
          </button>
        </div>
      </div>
    );
  }
  const cur = trip.tripCurrency;
  const spent = sumExpenses(allSpend, cur);
  const days = daysUntil(trip.startDate);

  return (
    <div className="min-h-screen bg-slate-50 mx-auto max-w-2xl pb-16">
      {/* Hero */}
      <div className="px-6 pt-12 pb-8 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg,#0f172a,#1e293b,#334155)' }}>
        <div className="absolute -right-6 -top-4 text-[120px] opacity-10 select-none">🌍</div>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-white/60 text-sm">{trip.destinations}</p>
            <h1 className="text-3xl font-bold mt-1">{trip.name}</h1>
            <p className="text-white/70 text-sm mt-1">
              {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)} · {tripLength(trip.startDate, trip.endDate)} days
            </p>
          </div>
          <button onClick={refresh} className="bg-white/10 hover:bg-white/20 rounded-full px-3 py-2 text-sm font-semibold flex items-center gap-1.5">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        {days > 0 && <div className="mt-4 inline-block bg-white/10 px-4 py-2 rounded-2xl text-xl font-bold">{days} days to go</div>}
        <div className="flex gap-2 mt-4">
          {travelers.map(t => (
            <span key={t.id} className="bg-white/10 px-2.5 py-1 rounded-full text-sm">{t.emoji} {t.name}</span>
          ))}
        </div>
        <span className="inline-block mt-4 text-[11px] uppercase tracking-wide bg-white/10 px-2 py-0.5 rounded">View only</span>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200 flex justify-center gap-1 px-4 py-2">
        {([
          { key: 'overview', label: 'Overview', icon: <Compass size={15} /> },
          { key: 'map',      label: 'Map',      icon: <MapIcon size={15} /> },
          { key: 'photos',   label: 'Photos',   icon: <Images size={15} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition ${view === t.key ? 'bg-ink text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {view === 'map' && <PortalMap transport={transport} stays={stays} itinerary={itinerary} pins={mapPins} />}
      {view === 'photos' && <PortalPhotos photos={photos} />}

      {view === 'overview' && (
      <div className="p-4">
        {/* Money summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Spent</p>
            <p className="text-xl font-bold text-slate-800">{money(spent, cur)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Budget</p>
            <p className="text-xl font-bold text-slate-800">{trip.totalBudget ? money(trip.totalBudget, cur) : '—'}</p>
          </div>
        </div>

        {/* Itinerary */}
        {itinerary.length > 0 && (
          <Section title="Itinerary" icon={<CalendarRange size={16} />} count={itinerary.length}>
            {dateRange(trip.startDate, trip.endDate).filter(d => itinerary.some(e => e.date === d)).map(d => (
              <div key={d} className="mb-3">
                <p className="text-xs font-bold text-slate-400 px-1 mb-1">{fmtDateLong(d)}</p>
                <div className="space-y-1.5">
                  {itinerary.filter(e => e.date === d).map(e => (
                    <div key={e.id} className="bg-white rounded-xl p-3 shadow-sm">
                      <p className="font-semibold text-slate-800">{e.title}</p>
                      <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                        {(e.startTime || e.endTime) && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(e.startTime)}{e.endTime ? `–${fmtTime(e.endTime)}` : ''}</span>}
                        {e.place && <span className="flex items-center gap-1"><MapPin size={11} />{e.place}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Transport */}
        {transport.length > 0 && (
          <Section title="Transport" icon={<Plane size={16} />} count={transport.length}>
            <div className="space-y-2">
              {transport.map(l => (
                <div key={l.id} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-slate-800">{l.fromPlace} → {l.toPlace}</p>
                    <p className="text-xs text-slate-400">{l.provider} · {fmtDate(l.departDate)}{l.departTime ? ` ${fmtTime(l.departTime)}` : ''}</p>
                  </div>
                  {l.confirmation && <span className="text-xs text-slate-500">🎫 {l.confirmation}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Stays */}
        {stays.length > 0 && (
          <Section title="Stays" icon={<BedDouble size={16} />} count={stays.length}>
            <div className="space-y-2">
              {stays.map(s => (
                <div key={s.id} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="font-semibold text-slate-800">{s.name}{s.city ? ` · ${s.city}` : ''}</p>
                  <p className="text-xs text-slate-400">{fmtDate(s.checkIn)} → {fmtDate(s.checkOut)}{s.confirmation ? ` · 🎫 ${s.confirmation}` : ''}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Documents (no images in portal for privacy of size — titles + expiry) */}
        {docs.length > 0 && (
          <Section title="Documents" icon={<FileText size={16} />} count={docs.length}>
            <div className="space-y-2">
              {docs.map(d => (
                <div key={d.id} className="bg-white rounded-xl p-3 shadow-sm flex justify-between">
                  <span className="font-medium text-slate-800">{d.title}</span>
                  {d.expiryDate && <span className="text-xs text-slate-400">exp {fmtDate(d.expiryDate, { month: 'short', year: 'numeric' })}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Expenses */}
        {expenses.length > 0 && (
          <Section title="Recent expenses" icon={<Wallet size={16} />} count={expenses.length}>
            <div className="space-y-1.5">
              {expenses.slice(0, 12).map(e => (
                <div key={e.id} className="bg-white rounded-xl p-3 shadow-sm flex justify-between">
                  <span className="text-slate-700">{e.title} <span className="text-xs text-slate-400">· {fmtDate(e.date)}</span></span>
                  <span className="font-semibold text-slate-800">{money(e.amount, e.currency)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Checklist */}
        {checklist.length > 0 && (
          <Section title="Checklist" icon={<ListChecks size={16} />} count={checklist.length}>
            <div className="bg-white rounded-xl p-3 shadow-sm space-y-1.5">
              {checklist.map(c => (
                <p key={c.id} className={`text-sm ${c.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {c.done ? '✓' : '○'} {c.text}
                </p>
              ))}
            </div>
          </Section>
        )}

        {budget.length === 0 && itinerary.length === 0 && transport.length === 0 && stays.length === 0 && expenses.length === 0 && (
          <p className="text-center text-slate-400 py-10">Nothing here yet — add details in the app, then Sync.</p>
        )}
      </div>
      )}

      <div className="text-center py-6 space-y-2">
        <a href="https://github.com/sgolas/sylsrepo/releases/latest/download/TripPlanner-Setup.exe"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-slate-600 transition">
          <Download size={14} /> Get the Windows desktop app
        </a>
        <p className="text-xs text-slate-300">Trip Planner · read-only portal · trip.sgolas.com</p>
      </div>
    </div>
  );
}

/* ── Portal: Map view ───────────────────────────────────────── */
function PortalMap({ transport, stays, itinerary, pins }: {
  transport: any[]; stays: any[]; itinerary: any[]; pins: any[];
}) {
  const [fallback, setFallback] = useState(false);
  const stops = computeStops(transport, stays, itinerary);
  if (stops.length === 0 && pins.length === 0)
    return <p className="text-center text-slate-400 py-16">No places pinned yet — add stays, transport or itinerary in the app.</p>;
  return (
    <div className="max-w-md mx-auto">
      {fallback ? <StringMap stops={stops} /> : <TripLeafletMap stops={stops} pins={pins} onFallback={() => setFallback(true)} />}
      <p className="text-center text-xs text-slate-400 -mt-2 pb-6">pins from your stops &amp; the spots you dropped</p>
    </div>
  );
}

/* ── Portal: Photo album view (folders + grid) ──────────────── */
function PortalPhotos({ photos }: { photos: any[] }) {
  const [folder, setFolder] = useState<string | null>(null);
  if (photos.length === 0)
    return <p className="text-center text-slate-400 py-16">No photos uploaded yet.</p>;

  const folders = Array.from(new Set(photos.map(p => p.folder))).sort().reverse();
  const shown = folder ? photos.filter(p => p.folder === folder) : photos;

  return (
    <div className="p-4">
      {folder ? (
        <button onClick={() => setFolder(null)} className="text-sm font-semibold text-pink-600 mb-3">‹ All folders</button>
      ) : (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{folders.length} folder{folders.length === 1 ? '' : 's'}</p>
      )}

      {!folder ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {folders.map(f => {
            const inF = photos.filter(p => p.folder === f);
            return (
              <button key={f} onClick={() => setFolder(f)}
                className="rounded-2xl overflow-hidden bg-white shadow-sm text-left active:scale-[0.98] transition">
                <div className="aspect-square bg-slate-100">
                  {inF[0] && <img src={inF[0].data || inF[0].url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="p-2.5">
                  <p className="font-semibold text-slate-800 text-sm truncate">📁 {f}</p>
                  <p className="text-xs text-slate-400">{inF.length} photo{inF.length === 1 ? '' : 's'}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {shown.map(p => (
            <a key={p.id} href={p.data || p.url} target="_blank" rel="noopener noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 block group">
              <img src={p.data || p.url} alt={p.caption} className="w-full h-full object-cover" loading="lazy" />
              {(p.place || p.caption) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4">
                  {p.place && <p className="text-white text-[9px] font-medium flex items-center gap-0.5 leading-tight"><MapPin size={8} />{p.place}</p>}
                  {p.caption && <p className="text-white/80 text-[8px] leading-tight truncate">{p.caption}</p>}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
