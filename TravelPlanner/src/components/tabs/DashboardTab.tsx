import { useState } from 'react';
import {
  ListChecks, Plane, BedDouble, Wallet, CalendarRange, PiggyBank,
  Sparkles, History, Compass, ChevronUp, ChevronDown, CalendarClock, Calculator,
} from 'lucide-react';
import {
  useTrip, useChecklist, useExpenses, useTransport, useAccommodation,
  useItinerary, useTravelers,
} from '../../hooks/useTrip';
import { money, moneyHome, moneyAway, sumExpenses } from '../../types';
import type { Transport, Accommodation } from '../../types';
import { daysUntil, fmtDate, fmtStamp, fmtTime, todayStr, tripLength } from '../../utils/format';
import { getLastSync } from '../../lib/config';
import { computeStops } from '../tripMap';
import { Monogram } from '../ui';
import { WeatherWidget } from '../WeatherWidget';
import { sectionByKey } from '../../lib/sections';
import { useShortcuts } from '../../lib/dashShortcuts';

const HERO_KEY = 'trip.heroOpen';

export function DashboardTab({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [heroOpen, setHeroOpen] = useState(() => localStorage.getItem(HERO_KEY) !== '0');
  function toggleHero() { setHeroOpen(o => { localStorage.setItem(HERO_KEY, o ? '0' : '1'); return !o; }); }
  const [gridOpen, setGridOpen] = useState(() => localStorage.getItem('w:grid') !== '0');
  function toggleGrid() { setGridOpen(o => { localStorage.setItem('w:grid', o ? '0' : '1'); return !o; }); }

  const pinned = useShortcuts();
  const trip = useTrip();
  const checklist = useChecklist();
  const expenses = useExpenses();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const travelers = useTravelers();

  if (!trip) return null;

  const days = daysUntil(trip.startDate);
  const spent = sumExpenses(expenses, trip.tripCurrency);
  const done = checklist.filter(c => c.done).length;
  const lastSync = getLastSync();
  const cur = trip.tripCurrency;

  const stops = computeStops(transport, stays, itinerary);
  const weatherLoc = stops[0]?.label || trip.destinations.split(/[·,]/)[0].trim();

  const today = todayStr();
  const flights = transport.filter(t => t.mode === 'flight');
  const nextFlight = flights.find(f => f.departDate >= today) ?? flights[0];
  const nextStay = stays.find(s => s.checkOut >= today) ?? stays[0];

  const budgetPct = trip.totalBudget > 0 ? Math.min(100, Math.round((spent / trip.totalBudget) * 100)) : 0;

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

            <div className="mt-5 flex items-stretch gap-3">
              <div className="glass rounded-2xl px-4 py-2.5 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold accent-text">{countdownLabel}</span>
                <span className="text-white/70 text-sm font-medium">{countdownSub}</span>
              </div>

              {/* Translator shortcut — icon only, gently pulsing for attention. */}
              <button onClick={() => onNavigate('translate')} aria-label="Open translator"
                className="flex items-center justify-center active:scale-90 transition">
                <img src="/translate-icon.png" alt="Translate"
                  className="h-full max-h-14 aspect-square rounded-2xl drop-shadow-lg animate-soft-pulse" />
              </button>
            </div>

            <div className="flex gap-1.5 mt-4 flex-wrap">
              {travelers.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 glass px-2.5 py-1 rounded-full text-sm">
                  {t.photo
                    ? <img src={t.photo} alt="" className="w-5 h-5 rounded-full object-cover" />
                    : <span>{t.emoji}</span>}
                  <span className="text-white/90 text-xs font-medium">{t.name}</span>
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
        {/* Pinned shortcuts (long-press items in More to add/remove) */}
        {pinned.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {pinned.map(key => {
              const s = sectionByKey(key);
              if (!s) return null;
              return (
                <button key={key} onClick={() => onNavigate(key)}
                  className="flex flex-col items-center gap-1.5 press">
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` }}>{s.icon}</span>
                  <span className="text-[11px] font-semibold text-muted text-center leading-tight">{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Weather */}
        <WeatherWidget location={weatherLoc} />

        {/* Next flight & stay */}
        <CollapsibleWidget id="flight" title="Next flight" icon={<Plane size={13} />}
          onOpen={() => onNavigate('transport')} summary={<FlightSummary flight={nextFlight} />}>
          <FlightBody flight={nextFlight} />
        </CollapsibleWidget>
        <CollapsibleWidget id="stay" title="Next stay" icon={<BedDouble size={13} />}
          onOpen={() => onNavigate('accommodation')} summary={<StaySummary stay={nextStay} />}>
          <StayBody stay={nextStay} />
        </CollapsibleWidget>

        {/* Budget */}
        <button onClick={() => onNavigate('budget')} className="w-full bg-surface rounded-3xl p-4 shadow-soft border border-line text-left press">
          <span className="flex items-center gap-1.5 text-muted text-xs font-semibold uppercase tracking-wide"><PiggyBank size={13} /> Budget</span>
          <div className="flex items-center gap-3 mt-2">
            <Ring pct={budgetPct} />
            <div className="min-w-0">
              <p className="font-bold text-content leading-tight truncate">{moneyHome(spent, cur)}</p>
              <p className="text-xs text-muted truncate">{moneyAway(spent, cur)}{trip.totalBudget ? ` · of ${moneyHome(trip.totalBudget, cur)}` : ''}</p>
            </div>
          </div>
        </button>

        {/* Section grid */}
        <div>
          <button onClick={toggleGrid}
            className="w-full flex items-center justify-between px-1 mb-2 press">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Plan your trip</span>
            {gridOpen ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
          </button>
          {gridOpen && (
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
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-3">
          <QuickLink onClick={() => onNavigate('overview')} icon={<Compass size={18} />} label="Overview" />
          <QuickLink onClick={() => onNavigate('converter')} icon={<Calculator size={18} />} label="Currency" />
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

/** A card with a title bar + collapse chevron. Open shows children (tap to
 *  navigate); collapsed shows a one-line summary. State persists per id. */
function CollapsibleWidget({ id, title, icon, summary, onOpen, children }: {
  id: string; title: string; icon: React.ReactNode; summary: React.ReactNode;
  onOpen?: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => localStorage.getItem('w:' + id) !== '0');
  const toggle = () => setOpen(o => { localStorage.setItem('w:' + id, o ? '0' : '1'); return !o; });
  return (
    <div className="bg-surface rounded-3xl shadow-soft border border-line overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="flex items-center gap-1.5 text-muted text-xs font-semibold uppercase tracking-wide">{icon} {title}</span>
        <button onClick={toggle} aria-label={open ? 'Collapse' : 'Expand'} className="text-muted press p-1 -m-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {open
        ? <div onClick={onOpen} className={`px-4 pb-4 ${onOpen ? 'press cursor-pointer' : ''}`}>{children}</div>
        : <button onClick={onOpen} className="w-full text-left px-4 pb-3 press">{summary}</button>}
    </div>
  );
}

function FlightBody({ flight }: { flight?: Transport }) {
  if (!flight) return <p className="text-sm text-muted">No flights yet — tap to add ✈️</p>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-content truncate">{flight.fromPlace || '—'}</p>
        <p className="text-xs text-muted">{fmtDate(flight.departDate)}{flight.departTime ? ` · ${fmtTime(flight.departTime)}` : ''}</p>
      </div>
      <div className="flex flex-col items-center flex-shrink-0">
        <Plane size={15} className="text-accent -rotate-45" />
        <div className="w-8 border-t border-dashed border-line mt-0.5" />
      </div>
      <div className="flex-1 min-w-0 text-right">
        <p className="font-bold text-content truncate">{flight.toPlace || '—'}</p>
        <p className="text-xs text-muted truncate">{flight.confirmation ? `🎫 ${flight.confirmation}` : ''}</p>
      </div>
    </div>
  );
}

function FlightSummary({ flight }: { flight?: Transport }) {
  if (!flight) return <p className="text-sm text-muted">No flights yet — tap to add ✈️</p>;
  return (
    <p className="text-sm font-semibold text-content truncate">
      {flight.fromPlace || '—'} → {flight.toPlace || '—'}
      <span className="text-muted font-normal"> · {fmtDate(flight.departDate)}</span>
    </p>
  );
}

function StayBody({ stay }: { stay?: Accommodation }) {
  if (!stay) return <p className="text-sm text-muted">No stays yet — tap to add 🏨</p>;
  const nights = tripLength(stay.checkIn, stay.checkOut);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="font-bold text-content truncate">{stay.name}{stay.city ? ` · ${stay.city}` : ''}</p>
        <p className="text-xs text-muted">{fmtDate(stay.checkIn)} → {fmtDate(stay.checkOut)}</p>
      </div>
      <span className="text-xs font-bold text-grape bg-grape/10 px-2.5 py-1 rounded-full flex-shrink-0">{nights}n</span>
    </div>
  );
}

function StaySummary({ stay }: { stay?: Accommodation }) {
  if (!stay) return <p className="text-sm text-muted">No stays yet — tap to add 🏨</p>;
  const nights = tripLength(stay.checkIn, stay.checkOut);
  return (
    <p className="text-sm font-semibold text-content truncate">
      {stay.name}<span className="text-muted font-normal"> · {fmtDate(stay.checkIn)} · {nights}n</span>
    </p>
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
