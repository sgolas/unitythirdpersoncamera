import { useState } from 'react';
import {
  Compass, ListChecks, Plane, BedDouble, Wallet, CalendarRange,
  PiggyBank, FileText, Sparkles, History, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useTrip, useChecklist, useExpenses, useTransport, useAccommodation, useItinerary, useTravelers } from '../../hooks/useTrip';
import { money } from '../../types';
import { daysUntil, fmtDate, tripLength } from '../../utils/format';
import { getLastSync } from '../../lib/config';
import { fmtStamp } from '../../utils/format';
import { Monogram } from '../ui';

const HERO_KEY = 'trip.heroOpen';

export function DashboardTab({ onNavigate }: { onNavigate: (v: any) => void }) {
  const [heroOpen, setHeroOpen] = useState(() => localStorage.getItem(HERO_KEY) !== '0');
  function toggleHero() {
    setHeroOpen(o => { localStorage.setItem(HERO_KEY, o ? '0' : '1'); return !o; });
  }
  const trip = useTrip();
  const checklist = useChecklist();
  const expenses = useExpenses();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const travelers = useTravelers();

  if (!trip) return null;

  const days = daysUntil(trip.startDate);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const done = checklist.filter(c => c.done).length;
  const lastSync = getLastSync();

  const countdownLabel =
    days > 0 ? `${days} days to go`
    : days === 0 ? 'Trip starts today! ✈️'
    : daysUntil(trip.endDate) >= 0 ? 'On your trip now 🌍'
    : 'Trip complete 🎉';

  const cards = [
    { key: 'itinerary',     label: 'Itinerary',   icon: <CalendarRange size={20} />, color: '#a78bfa', stat: `${itinerary.length} events` },
    { key: 'expenses',      label: 'Expenses',    icon: <Wallet size={20} />,        color: '#f59e0b', stat: money(spent, trip.tripCurrency) },
    { key: 'transport',     label: 'Transport',   icon: <Plane size={20} />,         color: '#38bdf8', stat: `${transport.length} legs` },
    { key: 'accommodation', label: 'Stays',       icon: <BedDouble size={20} />,     color: '#a78bfa', stat: `${stays.length} booked` },
    { key: 'checklist',     label: 'Checklist',   icon: <ListChecks size={20} />,    color: '#34d399', stat: `${done}/${checklist.length} done` },
    { key: 'budget',        label: 'Budget',      icon: <PiggyBank size={20} />,     color: '#f59e0b', stat: trip.totalBudget ? money(trip.totalBudget, trip.tripCurrency) : 'Set it' },
    { key: 'documents',     label: 'Documents',   icon: <FileText size={20} />,      color: '#64748b', stat: 'Passports…' },
    { key: 'helper',        label: 'Smart Helper',icon: <Sparkles size={20} />,      color: '#fb7185', stat: 'Tips & alerts' },
  ];

  return (
    <div className="animate-fadeUp">
      {/* Hero (collapsible) */}
      <div className="text-white relative overflow-hidden bg-monogram"
        style={{ background: 'linear-gradient(150deg, #0f172a 0%, #1e293b 55%, #334155 100%)' }}>
        <Monogram />
        <div className="absolute -right-8 -top-2 text-[120px] opacity-10 select-none pointer-events-none">🌍</div>

        {heroOpen ? (
          <div className="px-5 pad-header-top pb-6 relative">
            <p className="text-white/60 text-sm font-medium">{trip.destinations}</p>
            <h1 className="text-3xl font-bold mt-1">{trip.name}</h1>
            <p className="text-white/70 text-sm mt-1">
              {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)} · {tripLength(trip.startDate, trip.endDate)} days
            </p>

            <div className="mt-5 inline-flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-2xl">
              <span className="text-2xl font-bold">{countdownLabel}</span>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              {travelers.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full text-sm">
                  <span>{t.emoji}</span><span className="text-white/90">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 pad-header-top pb-3 relative flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold leading-tight">{trip.name}</h1>
              <p className="text-white/60 text-xs">{countdownLabel}</p>
            </div>
          </div>
        )}

        {/* hide/show toggle */}
        <button onClick={toggleHero}
          className="w-full flex items-center justify-center gap-1 py-1.5 bg-black/15 active:bg-black/25 text-white/80 text-xs font-semibold">
          {heroOpen ? <><ChevronUp size={14} /> Hide</> : <><ChevronDown size={14} /> Show trip banner</>}
        </button>
      </div>

      {/* Section grid */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-3">
          {cards.map(c => (
            <button key={c.key} onClick={() => onNavigate(c.key)}
              className="bg-white rounded-2xl p-4 shadow-sm text-left active:scale-[0.98] transition">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3"
                style={{ backgroundColor: c.color }}>{c.icon}</span>
              <p className="font-bold text-slate-800">{c.label}</p>
              <p className="text-slate-400 text-sm">{c.stat}</p>
            </button>
          ))}
        </div>

        {/* Trip overview + change log quick links */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <button onClick={() => onNavigate('overview')}
            className="bg-ink text-white rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition">
            <Compass size={22} />
            <span className="font-semibold">Trip Overview</span>
          </button>
          <button onClick={() => onNavigate('changelog')}
            className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.98] transition">
            <History size={20} className="text-slate-500" />
            <span className="font-semibold text-slate-700">Change Log</span>
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          {lastSync ? `Last synced ${fmtStamp(lastSync)}` : 'Not synced yet — tap Sync to link your family’s devices'}
        </p>
      </div>
    </div>
  );
}
