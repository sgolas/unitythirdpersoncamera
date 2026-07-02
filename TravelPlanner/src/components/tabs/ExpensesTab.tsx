import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useExpenses, useTravelers, useTrip, travelerName } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { Expense, ExpenseCategory } from '../../types';
import { money, sumExpenses, CURRENCY_SYMBOLS } from '../../types';
import { fmtDate, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';
import { PlaceInput } from '../PlaceInput';

const CATS: { key: ExpenseCategory; label: string; emoji: string; color: string }[] = [
  { key: 'food',       label: 'Food',       emoji: '🍽️', color: '#fb7185' },
  { key: 'transport',  label: 'Transport',  emoji: '🚆', color: '#38bdf8' },
  { key: 'lodging',    label: 'Lodging',    emoji: '🏨', color: '#a78bfa' },
  { key: 'activities', label: 'Activities', emoji: '🎫', color: '#34d399' },
  { key: 'shopping',   label: 'Shopping',   emoji: '🛍️', color: '#f59e0b' },
  { key: 'other',      label: 'Other',      emoji: '💶', color: '#64748b' },
];
const catMeta = (k: ExpenseCategory) => CATS.find(c => c.key === k)!;

export function ExpensesTab() {
  const expenses = useExpenses();
  const travelers = useTravelers();
  const trip = useTrip();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const cur = trip?.tripCurrency ?? 'EUR';
  const total = sumExpenses(expenses, cur);

  const byCat = CATS.map(c => ({
    ...c, sum: sumExpenses(expenses.filter(e => e.category === c.key), cur),
  })).filter(c => c.sum > 0);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Expenses" subtitle={`${money(total, cur)} spent`}
        gradient="linear-gradient(135deg,#d97706,#f59e0b)" icon="💶" />

      {byCat.length > 0 && (
        <div className="px-4 pt-4 flex gap-2 overflow-x-auto no-scrollbar">
          {byCat.map(c => (
            <div key={c.key} className="flex-shrink-0 bg-white rounded-2xl px-3.5 py-2.5 shadow-sm">
              <p className="text-xs text-slate-400">{c.emoji} {c.label}</p>
              <p className="font-bold text-slate-800">{money(c.sum, cur)}</p>
            </div>
          ))}
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState emoji="💶" title="No expenses yet" hint="Log what you spend on the trip" />
      ) : (
        <div className="px-4 py-4 space-y-2">
          {expenses.map(e => {
            const m = catMeta(e.category);
            return (
              <div key={e.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 group"
                onClick={() => setEditing(e)}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: m.color + '20' }}>{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{e.title}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDate(e.date)}{e.paidBy ? ` · ${travelerName(travelers, e.paidBy)}` : ''}{e.place ? ` · ${e.place}` : ''}
                  </p>
                </div>
                <p className="font-bold text-slate-800">{money(e.amount, e.currency)}</p>
                <button onClick={ev => { ev.stopPropagation(); setPendingDelete(e); }}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50">
                  <Trash2 size={15} className="text-slate-300 hover:text-sunset" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add expense" />

      {(adding || editing) && (
        <ExpenseSheet expense={editing} travelers={travelers} currency={cur}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.title}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('expense', pendingDelete.id, `Removed expense: ${pendingDelete.title}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function ExpenseSheet({ expense, travelers, currency, onClose }: {
  expense: Expense | null; travelers: any[]; currency: string; onClose: () => void;
}) {
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [curSel, setCurSel] = useState(expense?.currency ?? currency);
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'food');
  const [date, setDate] = useState(expense?.date ?? todayStr());
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? '');
  const [place, setPlace] = useState(expense?.place ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? '');

  async function save() {
    const amt = parseFloat(amount);
    if (!title.trim() || isNaN(amt) || amt <= 0) return;
    const isNew = !expense;
    await put<Expense>({
      kind: 'expense', id: expense?.id ?? crypto.randomUUID(),
      title: title.trim(), amount: amt, currency: curSel, category, date,
      paidBy: paidBy || null, place: place.trim(), notes: notes.trim(),
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} expense: ${title.trim()} (${money(amt, curSel)})`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!title.trim() || !amount} submitLabel={expense ? 'Save' : 'Add expense'} />}>
      <Field label="What was it?"><TextInput autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Dinner in Rome" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount"><TextInput type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Currency">
          <Select value={curSel} onChange={e => setCurSel(e.target.value)}>
            {Object.keys(CURRENCY_SYMBOLS).map(c => <option key={c} value={c}>{c} {CURRENCY_SYMBOLS[c].trim()}</option>)}
          </Select>
        </Field>
      </div>
      {amount && parseFloat(amount) > 0 && (
        <p className="text-sm text-slate-500 -mt-2 mb-1">Saved as <b className="text-slate-700">{money(parseFloat(amount), curSel)}</b></p>
      )}
      <Field label="Date"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Category">
        <Select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}>
          {CATS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
        </Select>
      </Field>
      <Field label="Paid by">
        <Select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
          <option value="">—</option>
          {travelers.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </Select>
      </Field>
      <Field label="Place"><PlaceInput value={place} onChange={setPlace} placeholder="Search a place…" /></Field>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Sheet>
  );
}
