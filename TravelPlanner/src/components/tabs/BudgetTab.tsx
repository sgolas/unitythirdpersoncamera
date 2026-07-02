import { useState } from 'react';
import { useBudget, useExpenses, useTrip } from '../../hooks/useTrip';
import { put } from '../../db/database';
import type { BudgetLine, ExpenseCategory, TripMeta } from '../../types';
import { money, moneyHome, moneyAway, sumExpenses } from '../../types';
import { convert, getHomeCurrency } from '../../lib/currency';
import { TabHeader, Sheet, Field, TextInput, FormFooter } from '../ui';

const CATS: { key: ExpenseCategory; label: string; emoji: string; color: string }[] = [
  { key: 'food',       label: 'Food',       emoji: '🍽️', color: '#fb7185' },
  { key: 'transport',  label: 'Transport',  emoji: '🚆', color: '#38bdf8' },
  { key: 'lodging',    label: 'Lodging',    emoji: '🏨', color: '#a78bfa' },
  { key: 'activities', label: 'Activities', emoji: '🎫', color: '#34d399' },
  { key: 'shopping',   label: 'Shopping',   emoji: '🛍️', color: '#f59e0b' },
  { key: 'other',      label: 'Other',      emoji: '💶', color: '#64748b' },
];

export function BudgetTab() {
  const budget = useBudget();
  const expenses = useExpenses();
  const trip = useTrip();
  const [editTotal, setEditTotal] = useState(false);
  const [editLine, setEditLine] = useState<ExpenseCategory | null>(null);

  if (!trip) return null;
  const cur = trip.tripCurrency;

  const plannedFor = (c: ExpenseCategory) => budget.find(b => b.category === c)?.planned ?? 0;
  const spentFor = (c: ExpenseCategory) => sumExpenses(expenses.filter(e => e.category === c), cur);

  const totalSpent = sumExpenses(expenses, cur);
  const totalBudget = trip.totalBudget;
  const remaining = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Budget" subtitle="Planned vs actual"
        gradient="linear-gradient(135deg,#d97706,#f59e0b)" icon="🐷" />

      {/* Top summary */}
      <div className="px-4 pt-4">
        <div className="bg-ink text-white rounded-3xl p-5" onClick={() => setEditTotal(true)}>
          <div className="flex justify-between items-baseline">
            <span className="text-white/60 text-sm">Total budget</span>
            <span className="text-white/60 text-sm underline">edit</span>
          </div>
          {totalBudget ? (
            <div className="mt-1">
              <p className="text-3xl font-bold leading-tight">{moneyHome(totalBudget, cur)}</p>
              <p className="text-white/50 text-sm">{moneyAway(totalBudget, cur)}</p>
            </div>
          ) : (
            <p className="text-3xl font-bold mt-1">Tap to set</p>
          )}
          {totalBudget > 0 && (
            <>
              <div className="h-2.5 bg-white/15 rounded-full mt-4 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: remaining < 0 ? '#fb7185' : '#34d399' }} />
              </div>
              <div className="flex justify-between mt-2 text-sm leading-tight">
                <span>
                  <span className="block text-white/80">Spent {moneyHome(totalSpent, cur)}</span>
                  <span className="block text-white/40 text-xs">{moneyAway(totalSpent, cur)}</span>
                </span>
                <span className="text-right">
                  <span className={`block ${remaining < 0 ? 'text-sunset font-semibold' : 'text-mint font-semibold'}`}>
                    {remaining < 0 ? `${moneyHome(-remaining, cur)} over` : `${moneyHome(remaining, cur)} left`}
                  </span>
                  <span className="block text-white/40 text-xs">
                    {remaining < 0 ? `${moneyAway(-remaining, cur)} over` : `${moneyAway(remaining, cur)} left`}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category lines */}
      <div className="px-4 py-4 space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">By category</p>
        {CATS.map(c => {
          const planned = plannedFor(c.key);
          const spent = spentFor(c.key);
          const linePct = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
          const over = planned > 0 && spent > planned;
          return (
            <div key={c.key} className="bg-white rounded-2xl p-4 shadow-sm" onClick={() => setEditLine(c.key)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{c.emoji} {c.label}</span>
                <span className="text-right leading-tight">
                  <span className="block text-sm font-semibold text-slate-700">
                    {moneyHome(spent, cur)}{planned > 0 && <span className="text-slate-400 font-normal"> / {moneyHome(planned, cur)}</span>}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {moneyAway(spent, cur)}{planned > 0 && ` / ${moneyAway(planned, cur)}`}
                  </span>
                </span>
              </div>
              {planned > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${linePct}%`, backgroundColor: over ? '#fb7185' : c.color }} />
                </div>
              )}
              {planned === 0 && <p className="text-xs text-slate-400 mt-1">Tap to set a plan</p>}
            </div>
          );
        })}
      </div>

      {editTotal && (
        <TotalSheet trip={trip} onClose={() => setEditTotal(false)} />
      )}
      {editLine && (
        <LineSheet category={editLine} currency={cur}
          existing={budget.find(b => b.category === editLine) ?? null}
          onClose={() => setEditLine(null)} />
      )}
    </div>
  );
}

function TotalSheet({ trip, onClose }: { trip: TripMeta; onClose: () => void }) {
  const home = getHomeCurrency();               // CAD
  const away = trip.tripCurrency;               // stored/compared currency (EUR/PLN)
  // Enter in CAD: pre-fill with the CAD equivalent of the stored amount.
  const [val, setVal] = useState(trip.totalBudget ? convert(trip.totalBudget, away, home).toFixed(2) : '');
  async function save() {
    const cad = parseFloat(val) || 0;
    const stored = convert(cad, home, away);    // convert back to trip currency for storage
    await put<TripMeta>({ ...trip, totalBudget: stored }, `Set total budget to ${money(stored, away)}`);
    onClose();
  }
  const preview = home !== away && parseFloat(val) ? `≈ ${moneyAway(parseFloat(val), home)}` : '';
  return (
    <Sheet title="Total budget" onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`Total budget (${home})`}>
        <TextInput autoFocus type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
      {preview && <p className="text-xs text-slate-400 -mt-2">{preview}</p>}
    </Sheet>
  );
}

function LineSheet({ category, currency, existing, onClose }: {
  category: ExpenseCategory; currency: string; existing: BudgetLine | null; onClose: () => void;
}) {
  const meta = CATS.find(c => c.key === category)!;
  const home = getHomeCurrency();               // CAD
  const away = currency;                         // stored/compared currency
  const [val, setVal] = useState(existing?.planned ? convert(existing.planned, away, home).toFixed(2) : '');
  async function save() {
    const isNew = !existing;
    const cad = parseFloat(val) || 0;
    const stored = convert(cad, home, away);
    await put<BudgetLine>({
      kind: 'budget', id: existing?.id ?? crypto.randomUUID(), category, planned: stored,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Set' : 'Updated'} ${meta.label} budget to ${money(stored, away)}`, isNew ? 'create' : 'update');
    onClose();
  }
  const preview = home !== away && parseFloat(val) ? `≈ ${moneyAway(parseFloat(val), home)}` : '';
  return (
    <Sheet title={`${meta.emoji} ${meta.label} budget`} onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`Planned amount (${home})`}>
        <TextInput autoFocus type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
      {preview && <p className="text-xs text-slate-400 -mt-2">{preview}</p>}
    </Sheet>
  );
}
