import { useState } from 'react';
import {
  ListChecks, Plane, BedDouble, Wallet, CalendarRange, PiggyBank, FileText,
  Sparkles, History, Compass, ChevronUp, ChevronDown, MapPin, ShieldCheck,
  ShieldAlert, CalendarClock,
} from 'lucide-react';
import {
  useTrip, useChecklist, useExpenses, useTransport, useAccommodation,
  useItinerary, useTravelers, useDocuments,
} from '../../hooks/useTrip';
import { money } from '../../types';
import { daysUntil, fmtDate, fmtStamp, tripLength } from '../../utils/format';
import { getLastSync } from '../../lib/config';
import { computeStops } from '../tripMap';
import { Monogram } from '../ui';

const HERO_KEY = 'trip.heroOpen';

export function DashboardTab({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [heroOpen, setHeroOpen] = useState(() => localStorage.getItem(HERO_KEY) !== '0');
  function toggleHero() { setHeroOpen(o => { localStorage.setItem(HERO_KEY, o ? '0' : '1'); return !o; }); }

  const trip = useTrip();
  const checklist = useChecklist();
  const expenses = useExpenses();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const travelers = useTravelers();
  const docs = useDocuments();

  if (!trip) return null;

  const days = daysUntil(trip.startDate);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const done = checklist.filter(c => c.done).length;
  const lastSync = getLastSync();
  const cur = trip.tripCurrency;

  const stops = computeStops(transport, stays, itinerary);
  const cities = new Set(stops.map(s => s.label.toLowerCase())).size;

  const budgetPct = trip.totalBudget > 0 ? Math.min(100, Math.round((spent / trip.totalBudget) * 100)) : 0;

  // Passport status from documents
  const passports = docs.filter(d => d.docType === 'passport');
  const passStatus = (() => {
    if (passports.length === 0) return { label: 'Add passports', tone: 'amber', icon: ShieldAlert };
    const soonest = Math.min(...passports.map(p => p.expiryDate ? daysUntil(p.expiryDate) : Infinity));
    if (soonest < 0) return { label: 'Expired', tone: 'red', icon: ShieldAlert };
    if (soonest < 180) return { label: 'Renew soon', tone: 'amber', icon: ShieldAlert };
    return { label: 'Valid', tone: 'green', icon: ShieldCheck };
  })();

  const countdownLabel =
    days > 0 ? `${days}` : days === 0 ? '0' : daysUntil(trip.endDate) >= 0 ? '•' : '✓';
  const countdownSub =
    days > 0 ? 'days to go' : days === 0 ? 'starts today!' : daysUntil(trip.endDate) >= 0 ? 'on your trip' : 'trip complete';

  const cards = [
    { key: 'itinerary',     label: 'Itinerary',   icon: <CalendarRange size={20} />, color: '#a78bfa', stat: `${itinerary.length} events` },
    { key: 'expenses',      label: 'Expenses',    icon: <Wallet size={20} />,        color: '#f59e0b', stat: money(spent, cur) },
    { key: 'transport',     label: 'Transport',   icon: <Plane size={20} />,         color: '#38bdf8', stat: `${transport.length} legs` },
    { key: 'accommodation', label: 'Stays',       icon: <BedDouble size={20} />,     color: '#a78bfa', stat: `${stays.length} booked` },
    { key: 'checklist',     label: 'Checklist',   icon: <ListChecks size={20} />,    color: '#34d399', stat: `${done}/${checklist.length} done` },
    { key: 'photos',        label: 'Photos',      icon: <Sparkles size={20} />,      color: '#ec4899', stat: 'Gallery' },
  ];

  return (
    <div className="animate-fadeUp pb-2">
      {/* Hero */}
      <div className="relative overflow-hidden text-white bg-monogram"
        style={{ background: 'linear-gradient(150deg, var(--hero-1), var(--hero-2) 55%, var(--hero-3))' }}>
        <Monogram />
        {/* accent glow */}
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-30 blur-3xl accent-gradient pointer-events-none" />
        <div className="absolute -right-6 top-4 text-[110px] opacity-10 select-none pointer-events-none animate-float">🌍</div>

        {heroOpen ? (
          <div className="px-5 pad-header-top pb-8 relative">
            <p className="text-white/60 text-xs font-semibold tracking-wide uppercase">{trip.destinations}</p>
            <h1 className="text-[2rem] leading-tight font-extrabold mt-1">{trip.name}</h1>
            <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
              <CalendarClock size={13} /> {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}
            </p>

            <div className="mt-5 flex items-end gap-3">
              <div className="glass rounded-2xl px-4 py-2.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold accent-text">{countdownLabel}</span>
                <span className="text-white/70 text-sm font-medium">{countdownSub}</span>
              </div>
            </div>

            <div className="flex gap-1.5 mt-4 flex-wrap">
              {travelers.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 glass px-2.5 py-1 rounded-full text-sm">
                  <span>{t.emoji}</span><span className="text-white/90 text-xs font-medium">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 pad-header-top pb-4 relative flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold leading-tight">{trip.name}</h1>
              <p className="text-white/60 text-xs">{days > 0 ? `${days} days to go` : countdownSub}</p>
            </div>
          </div>
        )}

        <button onClick={toggleHero}
          className="w-full flex items-center justify-center gap-1 py-1.5 bg-black/15 active:bg-black/25 text-white/80 text-xs font-semibold press">
          {heroOpen ? <><ChevronUp size={14} /> Hide</> : <><ChevronDown size={14} /> Show banner</>}
        </button>
      </div>

      <div className="px-4 -mt-5 relative space-y-4">
        {/* Stat strip (glass, overlapping hero) */}
        <div className="grid grid-cols-4 gap-2 stagger">
          <Stat value={tripLength(trip.startDate, trip.endDate)} label="Days" />
          <Stat value={cities} label="Cities" />
          <Stat value={travelers.length} label="People" />
          <Stat value={itinerary.length} label="Events" />
        </div>

        {/* Budget + Passport */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('budget')} className="bg-surface rounded-3xl p-4 shadow-soft border border-line text-left press">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted text-xs font-semibold uppercase tracking-wide"><PiggyBank size={13} /> Budget</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Ring pct={budgetPct} />
              <div className="min-w-0">
                <p className="font-bold text-content leading-tight truncate">{money(spent, cur)}</p>
                <p className="text-xs text-muted truncate">{trip.totalBudget ? `of ${money(trip.totalBudget, cur)}` : 'no budget set'}</p>
              </div>
            </div>
          </button>

          <button onClick={() => onNavigate('documents')} className="bg-surface rounded-3xl p-4 shadow-soft border border-line text-left press">
            <span className="flex items-center gap-1.5 text-muted text-xs font-semibold uppercase tracking-wide"><FileText size={13} /> Passport</span>
            <div className="flex items-center gap-2 mt-3">
              <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${
                passStatus.tone === 'green' ? 'bg-emerald-500' : passStatus.tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500'}`}>
                <passStatus.icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-content leading-tight">{passStatus.label}</p>
                <p className="text-xs text-muted">{passports.length} on file</p>
              </div>
            </div>
          </button>
        </div>

        {/* Section grid */}
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-wider px-1 mb-2">Plan your trip</p>
          <div className="grid grid-cols-2 gap-3 stagger">
            {cards.map(c => (
              <button key={c.key} onClick={() => onNavigate(c.key)}
                className="bg-surface rounded-3xl p-4 shadow-soft border border-line text-left press">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>{c.icon}</span>
                <p className="font-bold text-content">{c.label}</p>
                <p className="text-muted text-sm">{c.stat}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-3">
          <QuickLink onClick={() => onNavigate('map')} icon={<MapPin size={18} />} label="Map" />
          <QuickLink onClick={() => onNavigate('overview')} icon={<Compass size={18} />} label="Overview" />
          <QuickLink onClick={() => onNavigate('helper')} icon={<Sparkles size={18} />} label="Helper" />
        </div>

        <button onClick={() => onNavigate('changelog')}
          className="w-full flex items-center justify-center gap-2 text-muted text-xs py-2 press">
          <History size={13} /> {lastSync ? `Last synced ${fmtStamp(lastSync)}` : 'Not synced yet — tap Sync'}
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="glass rounded-2xl py-3 px-1 text-center shadow-glass">
      <p className="text-xl font-extrabold text-content leading-none">{value}</p>
      <p className="text-[10px] text-muted font-semibold uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}

function QuickLink({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="bg-surface rounded-2xl py-3 shadow-soft border border-line flex flex-col items-center gap-1 press">
      <span className="text-accent">{icon}</span>
      <span className="text-xs font-semibold text-content">{label}</span>
    </button>
  );
}

/** Small circular progress ring. */
function Ring({ pct }: { pct: number }) {
  const r = 16, c = 2 * Math.PI * r;
  const over = pct >= 100;
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" className="flex-shrink-0 -rotate-90">
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle cx="21" cy="21" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
        stroke={over ? '#fb7185' : 'var(--accent)'}
        strokeDasharray={c} strokeDashoffset={c - (Math.min(pct, 100) / 100) * c}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
    </svg>
  );
}
