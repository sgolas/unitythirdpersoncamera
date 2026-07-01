import { useState } from 'react';
import { useBudget, useExpenses, useTrip } from '../../hooks/useTrip';
import { put } from '../../db/database';
import type { BudgetLine, ExpenseCategory, TripMeta } from '../../types';
import { money } from '../../types';
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
  const spentFor = (c: ExpenseCategory) => expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
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
          <p className="text-3xl font-bold mt-1">{totalBudget ? money(totalBudget, cur) : 'Tap to set'}</p>
          {totalBudget > 0 && (
            <>
              <div className="h-2.5 bg-white/15 rounded-full mt-4 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: remaining < 0 ? '#fb7185' : '#34d399' }} />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-white/70">Spent {money(totalSpent, cur)}</span>
                <span className={remaining < 0 ? 'text-sunset font-semibold' : 'text-mint font-semibold'}>
                  {remaining < 0 ? `${money(-remaining, cur)} over` : `${money(remaining, cur)} left`}
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
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{c.emoji} {c.label}</span>
                <span className="text-sm text-slate-500">
                  {money(spent, cur)}{planned > 0 && <span className="text-slate-400"> / {money(planned, cur)}</span>}
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
  const [val, setVal] = useState(String(trip.totalBudget || ''));
  async function save() {
    await put<TripMeta>({ ...trip, totalBudget: parseFloat(val) || 0 },
      `Set total budget to ${money(parseFloat(val) || 0, trip.tripCurrency)}`);
    onClose();
  }
  return (
    <Sheet title="Total budget" onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`Total budget (${trip.tripCurrency})`}>
        <TextInput autoFocus type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
    </Sheet>
  );
}

function LineSheet({ category, currency, existing, onClose }: {
  category: ExpenseCategory; currency: string; existing: BudgetLine | null; onClose: () => void;
}) {
  const meta = CATS.find(c => c.key === category)!;
  const [val, setVal] = useState(String(existing?.planned || ''));
  async function save() {
    const isNew = !existing;
    await put<BudgetLine>({
      kind: 'budget', id: existing?.id ?? crypto.randomUUID(), category, planned: parseFloat(val) || 0,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Set' : 'Updated'} ${meta.label} budget to ${money(parseFloat(val) || 0, currency)}`, isNew ? 'create' : 'update');
    onClose();
  }
  return (
    <Sheet title={`${meta.emoji} ${meta.label} budget`} onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`Planned amount (${currency})`}>
        <TextInput autoFocus type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
    </Sheet>
  );
}
