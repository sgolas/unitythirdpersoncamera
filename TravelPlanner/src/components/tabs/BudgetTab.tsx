import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useBudget, useBudgetSheets, useSpend, useTrip } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { BudgetLine, BudgetSheet, ExpenseCategory, TripMeta } from '../../types';
import { money, moneyHome, moneyAway, sumExpenses } from '../../types';
import { convert, getHomeCurrency } from '../../lib/currency';
import { TabHeader, Sheet, Field, TextInput, FormFooter, GhostButton } from '../ui';

const CATS: { key: ExpenseCategory; label: string; emoji: string; color: string }[] = [
  { key: 'food',       label: 'Food',       emoji: '🍽️', color: '#fb7185' },
  { key: 'transport',  label: 'Transport',  emoji: '🚆', color: '#38bdf8' },
  { key: 'lodging',    label: 'Lodging',    emoji: '🏨', color: '#a78bfa' },
  { key: 'activities', label: 'Activities', emoji: '🎫', color: '#34d399' },
  { key: 'shopping',   label: 'Shopping',   emoji: '🛍️', color: '#f59e0b' },
  { key: 'other',      label: 'Other',      emoji: '💶', color: '#64748b' },
];

/** Grand total across the General budget + every sheet — the "total for all". */
export function grandBudget(trip: TripMeta, sheets: BudgetSheet[]): number {
  return trip.totalBudget + sheets.reduce((s, x) => s + x.total, 0);
}

type View = 'all' | 'general' | string; // 'all', 'general', or a sheet id

export function BudgetTab() {
  const budget = useBudget();
  const sheets = useBudgetSheets();
  const expenses = useSpend();
  const trip = useTrip();
  const [view, setView] = useState<View>('general');
  const [editTotal, setEditTotal] = useState(false);
  const [editLine, setEditLine] = useState<ExpenseCategory | null>(null);
  const [editSheet, setEditSheet] = useState<BudgetSheet | 'new' | null>(null);

  if (!trip) return null;
  const cur = trip.tripCurrency;

  // The active view resolves to a "sheet key": null = General, a sheet id, or
  // 'all' meaning every sheet + General combined.
  const activeSheet = sheets.find(s => s.id === view) ?? null;
  const key: 'all' | string | null = view === 'all' ? 'all' : view === 'general' ? null : view;
  const inView = <T extends { sheetId?: string | null }>(r: T) =>
    key === 'all' ? true : (r.sheetId ?? null) === key;

  const viewExpenses = expenses.filter(inView);
  const plannedFor = (c: ExpenseCategory) =>
    budget.filter(b => inView(b) && b.category === c).reduce((s, b) => s + b.planned, 0);
  const spentFor = (c: ExpenseCategory) => sumExpenses(viewExpenses.filter(e => e.category === c), cur);

  const totalSpent = sumExpenses(viewExpenses, cur);
  const totalBudget = view === 'all' ? grandBudget(trip, sheets)
    : view === 'general' ? trip.totalBudget
    : (activeSheet?.total ?? 0);
  const remaining = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  const title = view === 'all' ? 'All budgets' : view === 'general' ? 'General' : (activeSheet?.name ?? '');
  const canEditTotal = view !== 'all';   // grand total is computed, not editable
  const canEditLines = view !== 'all';   // category plans are per-sheet

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Budget" subtitle="Planned vs actual"
        gradient="linear-gradient(135deg,#d97706,#f59e0b)" icon="🐷" />

      {/* Sheet switcher — only once you've split the budget into sheets */}
      {sheets.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pt-3">
          {(['all', 'general', ...sheets.map(s => s.id)] as View[]).map(v => {
            const label = v === 'all' ? 'All' : v === 'general' ? 'General' : sheets.find(s => s.id === v)!.name;
            const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition ${active ? 'bg-ink text-white' : 'bg-slate-100 text-slate-500'}`}>
                {label}
              </button>
            );
          })}
          <button onClick={() => setEditSheet('new')}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold bg-slate-100 text-slate-500 flex items-center gap-1">
            <Plus size={14} /> Sheet
          </button>
        </div>
      )}

      {/* Top summary */}
      <div className="px-4 pt-4">
        <div className="bg-ink text-white rounded-3xl p-5" onClick={() => canEditTotal && setEditTotal(true)}>
          <div className="flex justify-between items-baseline">
            <span className="text-white/60 text-sm flex items-center gap-1.5">
              {title} budget
              {view !== 'general' && view !== 'all' && (
                <button onClick={e => { e.stopPropagation(); setEditSheet(activeSheet); }} aria-label="Edit sheet"><Pencil size={12} className="text-white/50" /></button>
              )}
            </span>
            {canEditTotal ? <span className="text-white/60 text-sm underline">edit</span>
              : <span className="text-white/40 text-xs">sum of all sheets</span>}
          </div>
          {totalBudget ? (
            <div className="mt-1">
              <p className="text-3xl font-bold leading-tight">{moneyHome(totalBudget, cur)}</p>
              <p className="text-white/50 text-sm">{moneyAway(totalBudget, cur)}</p>
            </div>
          ) : (
            <p className="text-3xl font-bold mt-1">{canEditTotal ? 'Tap to set' : '—'}</p>
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
                  <span className={`block font-semibold ${remaining < 0 ? 'text-sunset' : 'text-mint'}`}>
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

      {/* All view: per-sheet breakdown */}
      {view === 'all' && (
        <div className="px-4 py-4 space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">By sheet</p>
          {[{ id: 'general', name: 'General', total: trip.totalBudget }, ...sheets].map(s => {
            const sk = s.id === 'general' ? null : s.id;
            const sSpent = sumExpenses(expenses.filter(e => (e.sheetId ?? null) === sk), cur);
            return (
              <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm" onClick={() => setView(s.id === 'general' ? 'general' : s.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{s.id === 'general' ? '🧾' : '📍'} {s.name}</span>
                  <span className="text-right leading-tight">
                    <span className="block text-sm font-semibold text-slate-700">{moneyHome(sSpent, cur)}{s.total > 0 && <span className="text-slate-400 font-normal"> / {moneyHome(s.total, cur)}</span>}</span>
                    <span className="block text-xs text-slate-400">{moneyAway(sSpent, cur)}{s.total > 0 && ` / ${moneyAway(s.total, cur)}`}</span>
                  </span>
                </div>
                {s.total > 0 && (
                  <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (sSpent / s.total) * 100)}%`, backgroundColor: sSpent > s.total ? '#fb7185' : '#f59e0b' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Category lines */}
      <div className="px-4 py-4 space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">By category{view === 'all' ? ' (all sheets)' : ''}</p>
        {CATS.map(c => {
          const planned = plannedFor(c.key);
          const spent = spentFor(c.key);
          const linePct = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
          const over = planned > 0 && spent > planned;
          return (
            <div key={c.key} className="bg-white rounded-2xl p-4 shadow-sm" onClick={() => canEditLines && setEditLine(c.key)}>
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
              {planned === 0 && canEditLines && <p className="text-xs text-slate-400 mt-1">Tap to set a plan</p>}
            </div>
          );
        })}

        {/* Start splitting into sheets */}
        {sheets.length === 0 && (
          <GhostButton onClick={() => setEditSheet('new')}>
            <span className="flex items-center justify-center gap-1.5"><Plus size={16} /> Add a budget sheet (e.g. per country)</span>
          </GhostButton>
        )}
      </div>

      {editTotal && canEditTotal && (
        view === 'general'
          ? <TotalSheet trip={trip} onClose={() => setEditTotal(false)} />
          : activeSheet && <SheetTotalSheet sheet={activeSheet} currency={cur} onClose={() => setEditTotal(false)} />
      )}
      {editLine && canEditLines && (
        <LineSheet category={editLine} currency={cur} sheetId={key === 'all' ? null : key}
          existing={budget.find(b => b.category === editLine && (b.sheetId ?? null) === (key === 'all' ? null : key)) ?? null}
          onClose={() => setEditLine(null)} />
      )}
      {editSheet && (
        <SheetEditor sheet={editSheet === 'new' ? null : editSheet} currency={cur} order={sheets.length}
          onClose={() => setEditSheet(null)}
          onDeleted={() => { setEditSheet(null); setView('general'); }} />
      )}
    </div>
  );
}

function TotalSheet({ trip, onClose }: { trip: TripMeta; onClose: () => void }) {
  const home = getHomeCurrency();
  const away = trip.tripCurrency;
  const [val, setVal] = useState(trip.totalBudget ? convert(trip.totalBudget, away, home).toFixed(2) : '');
  async function save() {
    const stored = convert(parseFloat(val) || 0, home, away);
    await put<TripMeta>({ ...trip, totalBudget: stored }, `Set General budget to ${money(stored, away)}`);
    onClose();
  }
  const preview = home !== away && parseFloat(val) ? `≈ ${moneyAway(parseFloat(val), home)}` : '';
  return (
    <Sheet title="General budget" onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`General budget (${home})`}>
        <TextInput autoFocus type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
      {preview && <p className="text-xs text-slate-400 -mt-2">{preview}</p>}
    </Sheet>
  );
}

function SheetTotalSheet({ sheet, currency, onClose }: { sheet: BudgetSheet; currency: string; onClose: () => void }) {
  const home = getHomeCurrency();
  const [val, setVal] = useState(sheet.total ? convert(sheet.total, currency, home).toFixed(2) : '');
  async function save() {
    const stored = convert(parseFloat(val) || 0, home, currency);
    await put<BudgetSheet>({ ...sheet, total: stored }, `Set ${sheet.name} budget to ${money(stored, currency)}`);
    onClose();
  }
  const preview = home !== currency && parseFloat(val) ? `≈ ${moneyAway(parseFloat(val), home)}` : '';
  return (
    <Sheet title={`${sheet.name} budget`} onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`${sheet.name} budget (${home})`}>
        <TextInput autoFocus type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
      {preview && <p className="text-xs text-slate-400 -mt-2">{preview}</p>}
    </Sheet>
  );
}

function SheetEditor({ sheet, currency, order, onClose, onDeleted }: {
  sheet: BudgetSheet | null; currency: string; order: number; onClose: () => void; onDeleted: () => void;
}) {
  const home = getHomeCurrency();
  const [name, setName] = useState(sheet?.name ?? '');
  const [val, setVal] = useState(sheet?.total ? convert(sheet.total, currency, home).toFixed(2) : '');
  async function save() {
    if (!name.trim()) return;
    const stored = convert(parseFloat(val) || 0, home, currency);
    const isNew = !sheet;
    await put<BudgetSheet>({
      kind: 'budgetsheet', id: sheet?.id ?? crypto.randomUUID(),
      name: name.trim(), total: stored, order: sheet?.order ?? order,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} budget sheet: ${name.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }
  return (
    <Sheet title={sheet ? 'Edit budget sheet' : 'New budget sheet'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel={sheet ? 'Save' : 'Add sheet'} disabled={!name.trim()} />}>
      <Field label="Name"><TextInput autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. France, Italy, Road trip" /></Field>
      <Field label={`Planned total (${home}) — optional`}>
        <TextInput type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00" />
      </Field>
      {sheet && (
        <button
          onClick={async () => {
            // Delete the sheet: drop its category plans and un-assign its expenses
            // back to General so nothing silently vanishes.
            const { db } = await import('../../db/database');
            const lines = await db.budget.where('sheetId').equals(sheet.id).toArray().catch(() => []);
            for (const l of lines) await remove('budget', l.id, `Removed ${sheet.name} plan`);
            const exps = (await db.expenses.toArray()).filter(e => e.sheetId === sheet.id);
            for (const e of exps) await put({ ...e, sheetId: null }, `Moved expense to General`, 'update');
            await remove('budgetsheet', sheet.id, `Removed budget sheet: ${sheet.name}`);
            onDeleted();
          }}
          className="w-full mt-2 py-2.5 rounded-2xl font-semibold text-sunset bg-red-50 active:bg-red-100">
          Delete sheet
        </button>
      )}
    </Sheet>
  );
}

function LineSheet({ category, currency, sheetId, existing, onClose }: {
  category: ExpenseCategory; currency: string; sheetId: string | null; existing: BudgetLine | null; onClose: () => void;
}) {
  const meta = CATS.find(c => c.key === category)!;
  const home = getHomeCurrency();
  const away = currency;
  const [val, setVal] = useState(existing?.planned ? convert(existing.planned, away, home).toFixed(2) : '');
  async function save() {
    const isNew = !existing;
    const stored = convert(parseFloat(val) || 0, home, away);
    await put<BudgetLine>({
      kind: 'budget', id: existing?.id ?? crypto.randomUUID(), category, planned: stored, sheetId,
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
