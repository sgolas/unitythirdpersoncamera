import {
  useTrip, useDocuments, useChecklist, useAccommodation, useExpenses,
  useTransport, useItinerary, useBudgetSheets,
} from '../../hooks/useTrip';
import { money, sumExpenses } from '../../types';
import { daysUntil, dateRange, fmtDate } from '../../utils/format';
import { TabHeader } from '../ui';

type Insight = { tone: 'alert' | 'warn' | 'tip' | 'good'; icon: string; text: string; nav?: string };

export function HelperTab({ onNavigate }: { onNavigate: (v: any) => void }) {
  const trip = useTrip();
  const sheets = useBudgetSheets();
  const docs = useDocuments();
  const checklist = useChecklist();
  const stays = useAccommodation();
  const expenses = useExpenses();
  const transport = useTransport();
  const itinerary = useItinerary();

  if (!trip) return null;
  const insights: Insight[] = [];
  const dLeft = daysUntil(trip.startDate);

  // Countdown
  if (dLeft > 0) insights.push({ tone: 'tip', icon: '⏳', text: `${dLeft} days until your trip begins.` });
  else if (dLeft <= 0 && daysUntil(trip.endDate) >= 0) insights.push({ tone: 'good', icon: '🌍', text: `You're on your trip — enjoy!` });

  // Passport / document expiry (6-month rule for Europe)
  docs.forEach(d => {
    if (!d.expiryDate) return;
    const exp = daysUntil(d.expiryDate);
    if (exp < 0) insights.push({ tone: 'alert', icon: '🛂', text: `${d.title} has EXPIRED. Renew before travel.`, nav: 'documents' });
    else if (d.docType === 'passport' && exp < 180)
      insights.push({ tone: 'alert', icon: '🛂', text: `${d.title} expires in ${exp} days — many EU countries require 6 months validity.`, nav: 'documents' });
    else if (exp < 60)
      insights.push({ tone: 'warn', icon: '📄', text: `${d.title} expires ${fmtDate(d.expiryDate, { month: 'short', day: 'numeric', year: 'numeric' })}.`, nav: 'documents' });
  });

  // No passports stored at all
  if (!docs.some(d => d.docType === 'passport'))
    insights.push({ tone: 'warn', icon: '🛂', text: `No passports stored yet — add each traveler's passport.`, nav: 'documents' });

  // Accommodation coverage gaps
  const nights = dateRange(trip.startDate, trip.endDate).slice(0, -1); // nights = days minus last
  const covered = new Set<string>();
  stays.forEach(s => dateRange(s.checkIn, s.checkOut).slice(0, -1).forEach(d => covered.add(d)));
  const uncovered = nights.filter(n => !covered.has(n));
  if (stays.length === 0)
    insights.push({ tone: 'warn', icon: '🏨', text: `No accommodation booked yet.`, nav: 'accommodation' });
  else if (uncovered.length > 0)
    insights.push({ tone: 'warn', icon: '🏨', text: `${uncovered.length} night${uncovered.length === 1 ? '' : 's'} without a booked stay (first: ${fmtDate(uncovered[0])}).`, nav: 'accommodation' });
  else
    insights.push({ tone: 'good', icon: '🏨', text: `Every night of the trip has a place to stay ✓` });

  // Transport in/out
  if (!transport.length)
    insights.push({ tone: 'warn', icon: '✈️', text: `No transport booked — add your flights/trains.`, nav: 'transport' });

  // Budget
  const spent = sumExpenses(expenses, trip.tripCurrency);
  const totalBudget = trip.totalBudget + sheets.reduce((s, x) => s + x.total, 0);
  if (totalBudget > 0) {
    const pct = (spent / totalBudget) * 100;
    if (pct >= 100) insights.push({ tone: 'alert', icon: '💸', text: `You're over budget by ${money(spent - totalBudget, trip.tripCurrency)}.`, nav: 'budget' });
    else if (pct >= 80) insights.push({ tone: 'warn', icon: '💶', text: `You've used ${Math.round(pct)}% of your budget.`, nav: 'budget' });
  } else {
    insights.push({ tone: 'tip', icon: '🐷', text: `Set a total budget to track spending.`, nav: 'budget' });
  }

  // Checklist near departure
  const undone = checklist.filter(c => !c.done).length;
  if (dLeft >= 0 && dLeft <= 7 && undone > 0)
    insights.push({ tone: 'warn', icon: '🧳', text: `${undone} checklist item${undone === 1 ? '' : 's'} still open with departure near.`, nav: 'checklist' });

  // Empty itinerary days during trip
  if (itinerary.length === 0)
    insights.push({ tone: 'tip', icon: '🗓️', text: `Your itinerary is empty — start planning your days.`, nav: 'itinerary' });

  const order = { alert: 0, warn: 1, tip: 2, good: 3 } as const;
  insights.sort((a, b) => order[a.tone] - order[b.tone]);

  const toneStyle = {
    alert: 'bg-rose-50 border-sunset/30 text-rose-900',
    warn:  'bg-amber-50 border-amber/30 text-amber-900',
    tip:   'bg-sky-50 border-sky/30 text-sky-900',
    good:  'bg-emerald-50 border-mint/30 text-emerald-900',
  };

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Smart Helper" subtitle="Backstage magic — live tips & alerts"
        gradient="linear-gradient(135deg,#e11d48,#fb7185)" icon="✨" />

      <div className="px-4 py-4 space-y-2.5">
        {insights.map((ins, i) => (
          <button key={i} onClick={() => ins.nav && onNavigate(ins.nav)}
            className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border ${toneStyle[ins.tone]} ${ins.nav ? 'active:scale-[0.99]' : ''} transition`}>
            <span className="text-xl flex-shrink-0">{ins.icon}</span>
            <span className="text-sm font-medium leading-snug">{ins.text}</span>
          </button>
        ))}
        <p className="text-center text-xs text-slate-400 pt-3">
          These update automatically as you fill in your trip.
        </p>
      </div>
    </div>
  );
}
