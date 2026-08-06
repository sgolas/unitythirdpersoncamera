import { useEffect, useState } from 'react';
import { Plus, Pencil, ChevronRight } from 'lucide-react';
import { useBudget, useBudgetSheets, useSpend, useTrip, type SpendItem } from '../../hooks/useTrip';
import { db, put, remove } from '../../db/database';
import type { BudgetLine, BudgetSheet, Expense, ExpenseCategory, TripMeta } from '../../types';
import { money, moneyHome, moneyAway, sumExpenses, countsToBudget } from '../../types';
import { convert, getHomeCurrency } from '../../lib/currency';
import { fmtDate } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, Select, FormFooter, GhostButton, EmptyState } from '../ui';

const SOURCE_LABEL: Record<string, string> = { accommodation: 'Stay', transport: 'Transport', carrental: 'Car rental' };

const CATS: { key: ExpenseCategory; label: string; emoji: string; color: string }[] = [
  { key: 'food',       label: 'Food',       emoji: '🍽️', color: '#fb7185' },
  { key: 'transport',  label: 'Transport',  emoji: '🚆', color: '#38bdf8' },
  { key: 'lodging',    label: 'Lodging',    emoji: '🏨', color: '#a78bfa' },
  { key: 'activities', label: 'Activities', emoji: '🎫', color: '#34d399' },
  { key: 'shopping',   label: 'Shopping',   emoji: '🛍️', color: '#f59e0b' },
  { key: 'other',      label: 'Other',      emoji: '💶', color: '#64748b' },
];

type View = 'general' | string; // 'general' (whole vacation) or a sheet id

export function BudgetTab({ onNavigate }: { onNavigate?: (v: any) => void } = {}) {
  const budget = useBudget();
  const sheets = useBudgetSheets();
  const expenses = useSpend();
  const trip = useTrip();
  // Remember the last-opened sheet across page and app restarts.
  const [view, setView] = useState<View>(() => localStorage.getItem('budget.view') || 'general');
  useEffect(() => { localStorage.setItem('budget.view', view); }, [view]);
  // Only reset a stale sheet id once sheets have actually loaded (they're [] for
  // a tick on mount, which would otherwise wrongly bounce us back to General).
  useEffect(() => { if (view !== 'general' && sheets.length > 0 && !sheets.find(s => s.id === view)) setView('general'); }, [sheets, view]);
  const [editTotal, setEditTotal] = useState(false);
  const [editLine, setEditLine] = useState<ExpenseCategory | null>(null);
  const [editSheet, setEditSheet] = useState<BudgetSheet | 'new' | null>(null);
  const [detailCat, setDetailCat] = useState<ExpenseCategory | null>(null);

  if (!trip) return null;
  const cur = trip.tripCurrency;

  // General is the whole-vacation total (every item counts); a sheet shows only
  // the items assigned to it. Planned amounts stay tied to where they were set
  // (General → unassigned lines; a sheet → that sheet's lines).
  const activeSheet = sheets.find(s => s.id === view) ?? null;
  const isGeneral = view === 'general' || (sheets.length > 0 && !activeSheet);
  const spentInView = (r: { sheetId?: string | null }) => isGeneral ? true : (r.sheetId ?? null) === view;
  const plannedInView = (r: { sheetId?: string | null }) => (r.sheetId ?? null) === (isGeneral ? null : view);

  const viewExpenses = expenses.filter(e => spentInView(e) && countsToBudget(e));
  const plannedFor = (c: ExpenseCategory) =>
    budget.filter(b => plannedInView(b) && b.category === c).reduce((s, b) => s + b.planned, 0);
  const spentFor = (c: ExpenseCategory) => sumExpenses(viewExpenses.filter(e => e.category === c), cur);

  const totalSpent = sumExpenses(viewExpenses, cur);
  const totalBudget = isGeneral ? trip.totalBudget : (activeSheet?.total ?? 0);
  const remaining = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  const title = isGeneral ? 'Whole trip' : (activeSheet?.name ?? '');
  const canEditTotal = true;
  const canEditLines = true;

  async function setItemSheet(it: SpendItem, sheetId: string | null) {
    if (!trip) return;
    const dest = sheetId ? (sheets.find(s => s.id === sheetId)?.name ?? 'sheet') : 'General';
    if (it.auto) {
      const map = { ...(trip.autoSheet ?? {}) };
      if (sheetId) map[it.id] = sheetId; else delete map[it.id];
      await put<TripMeta>({ ...trip, autoSheet: map }, `Moved ${it.title} to ${dest}`);
    } else {
      const e = await db.expenses.get(it.id);
      if (e) await put<Expense>({ ...e, sheetId: sheetId ?? null }, `Moved ${it.title} to ${dest}`, 'update');
    }
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Budget" subtitle="Planned vs actual"
        gradient="linear-gradient(135deg,#d97706,#f59e0b)" icon="🐷" />

      {/* Sheet switcher — only once you've split the budget into sheets */}
      {sheets.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pt-3">
          {(['general', ...sheets.map(s => s.id)] as View[]).map(v => {
            const label = v === 'general' ? '🧾 Whole trip' : `📍 ${sheets.find(s => s.id === v)!.name}`;
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
              {!isGeneral && (
                <button onClick={e => { e.stopPropagation(); setEditSheet(activeSheet); }} aria-label="Edit sheet"><Pencil size={12} className="text-white/50" /></button>
              )}
            </span>
            <span className="text-white/60 text-sm underline">edit</span>
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

      {/* Whole-trip view: how the total splits across your location sheets. */}
      {isGeneral && sheets.length > 0 && (
        <div className="px-4 py-4 space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">By location</p>
          {[...sheets.map(s => ({ id: s.id, name: s.name, total: s.total })), { id: '', name: 'Unassigned', total: 0 }].map(s => {
            const sSpent = sumExpenses(expenses.filter(e => (e.sheetId ?? null) === (s.id || null) && countsToBudget(e)), cur);
            if (!s.id && sSpent === 0) return null;
            return (
              <div key={s.id || 'unassigned'} className="bg-white rounded-2xl p-4 shadow-sm active:bg-slate-50" onClick={() => s.id && setView(s.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{s.id ? '📍' : '🧾'} {s.name}</span>
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
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">By category</p>
        {CATS.map(c => {
          const planned = plannedFor(c.key);
          const spent = spentFor(c.key);
          const linePct = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
          const over = planned > 0 && spent > planned;
          return (
            <div key={c.key} className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer active:bg-slate-50 transition" onClick={() => setDetailCat(c.key)}>
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
              <p className="text-xs text-slate-400 mt-1">Tap to see items{planned === 0 && canEditLines ? ' & set a plan' : ''}</p>
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
        <LineSheet category={editLine} currency={cur} sheetId={isGeneral ? null : view}
          existing={budget.find(b => b.category === editLine && (b.sheetId ?? null) === (isGeneral ? null : view)) ?? null}
          onClose={() => setEditLine(null)} />
      )}
      {editSheet && (
        <SheetEditor sheet={editSheet === 'new' ? null : editSheet} currency={cur} order={sheets.length}
          onClose={() => setEditSheet(null)}
          onDeleted={() => { setEditSheet(null); setView('general'); }} />
      )}
      {detailCat && (() => {
        const c = CATS.find(x => x.key === detailCat)!;
        return (
          <CategoryDetail cat={c} currency={cur} sheets={sheets}
            items={viewExpenses.filter(e => e.category === detailCat)}
            planned={plannedFor(detailCat)} spent={spentFor(detailCat)}
            canEditPlan={canEditLines}
            onEditPlan={() => { setDetailCat(null); setEditLine(detailCat); }}
            onOpenItem={(it) => { setDetailCat(null); onNavigate?.(it.auto ? it.source : 'expenses'); }}
            onSetSheet={setItemSheet}
            onClose={() => setDetailCat(null)} />
        );
      })()}
    </div>
  );
}

/** Lists every item that rolls up into one budget category (real expenses plus
 *  the stay/transport/car costs folded in), with the option to set its plan. */
function CategoryDetail({ cat, items, currency, sheets, planned, spent, canEditPlan, onEditPlan, onOpenItem, onSetSheet, onClose }: {
  cat: { key: ExpenseCategory; label: string; emoji: string; color: string };
  items: SpendItem[]; currency: string; sheets: BudgetSheet[]; planned: number; spent: number;
  canEditPlan: boolean; onEditPlan: () => void; onOpenItem: (it: SpendItem) => void;
  onSetSheet: (it: SpendItem, sheetId: string | null) => void; onClose: () => void;
}) {
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
  const over = planned > 0 && spent > planned;
  return (
    <Sheet title={`${cat.emoji} ${cat.label}`} onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500">Spent</span>
        <span className="text-right leading-tight">
          <span className="block font-bold text-slate-800">{moneyHome(spent, currency)}{planned > 0 && <span className="text-slate-400 font-normal"> / {moneyHome(planned, currency)}</span>}</span>
          <span className="block text-xs text-slate-400">{moneyAway(spent, currency)}</span>
        </span>
      </div>
      {planned > 0 && (
        <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: over ? '#fb7185' : cat.color }} />
        </div>
      )}
      {canEditPlan && (
        <button onClick={onEditPlan}
          className="mt-3 w-full py-2.5 rounded-2xl font-semibold text-slate-700 bg-slate-100 active:bg-slate-200 transition text-sm">
          {planned > 0 ? 'Edit planned amount' : 'Set a planned amount'}
        </button>
      )}

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-5 mb-2">{items.length} item{items.length === 1 ? '' : 's'}</p>
      {items.length === 0 ? (
        <EmptyState emoji={cat.emoji} title="Nothing here yet" hint={`No ${cat.label.toLowerCase()} spending recorded.`} />
      ) : (
        <div className="space-y-2 -mx-1">
          {items.map(it => {
            const meta = (it.auto
              ? [`From ${SOURCE_LABEL[it.source ?? ''] ?? 'booking'}`, fmtDate(it.date), it.place]
              : [fmtDate(it.date), it.place]
            ).filter(Boolean).join(' · ');
            return (
              <div key={it.id} className="bg-slate-50 rounded-xl px-3 py-2.5">
                <button onClick={() => onOpenItem(it)} className="w-full flex items-center gap-3 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{it.title}</p>
                    {meta && <p className="text-xs text-slate-400 truncate">{meta}</p>}
                  </div>
                  <span className="font-bold text-slate-800 whitespace-nowrap">{moneyHome(it.amount, it.currency)}</span>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
                {sheets.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400 flex-shrink-0">Sheet</span>
                    <Select value={it.sheetId ?? ''} onChange={e => onSetSheet(it, e.target.value || null)}>
                      <option value="">🧾 General (whole trip)</option>
                      {sheets.map(s => <option key={s.id} value={s.id}>📍 {s.name}</option>)}
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function TotalSheet({ trip, onClose }: { trip: TripMeta; onClose: () => void }) {
  const home = getHomeCurrency();
  const away = trip.tripCurrency;
  const [val, setVal] = useState(trip.totalBudget ? convert(trip.totalBudget, away, home).toFixed(2) : '');
  async function save() {
    const stored = convert(parseFloat(val) || 0, home, away);
    await put<TripMeta>({ ...trip, totalBudget: stored }, `Set whole-trip budget to ${money(stored, away)}`);
    onClose();
  }
  const preview = home !== away && parseFloat(val) ? `≈ ${moneyAway(parseFloat(val), home)}` : '';
  return (
    <Sheet title="Whole-trip budget" onClose={onClose} footer={<FormFooter onCancel={onClose} onSubmit={save} submitLabel="Save" />}>
      <Field label={`Whole-trip budget (${home})`}>
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
