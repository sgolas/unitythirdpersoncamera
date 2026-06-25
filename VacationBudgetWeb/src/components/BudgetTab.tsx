import { useState, useEffect } from 'react';
import { Edit2, Plus, MapPin, Trash2, Pencil, TrendingUp, PiggyBank, Receipt, Mail, Loader, ExternalLink } from 'lucide-react';
import { Budget, Expense, ExpenseCategory, CATEGORY_META, Currency } from '../types';
import { BudgetDialog } from './BudgetDialog';
import { ExpenseDialog } from './ExpenseDialog';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  budget: Budget;
  expenses: Expense[];
  onUpdateBudget: (b: Budget) => void;
  onAddExpense: (e: Expense) => void;
  onUpdateExpense: (e: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

const ALL = 'ALL' as const;
type Filter = ExpenseCategory | typeof ALL;

export function BudgetTab({ budget, expenses, onUpdateBudget, onAddExpense, onUpdateExpense, onDeleteExpense }: Props) {
  const { user } = useAuth();
  const [showBudgetDialog,  setShowBudgetDialog]  = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense,    setEditingExpense]    = useState<Expense | null>(null);
  const [filter,            setFilter]            = useState<Filter>(ALL);
  const [undoExpense,       setUndoExpense]       = useState<Expense | null>(null);
  const [undoVisible,       setUndoVisible]       = useState(false);
  const [emailingId,        setEmailingId]        = useState<string | null>(null);
  const [emailToast,        setEmailToast]        = useState('');
  const [confirmingExpense, setConfirmingExpense] = useState<Expense | null>(null);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const remaining  = budget.totalAmount - totalSpent;
  const percent    = budget.totalAmount > 0 ? totalSpent / budget.totalAmount : 0;
  const isOver     = remaining < 0;

  const filtered = filter === ALL ? expenses : expenses.filter(e => e.category === filter);

  function handleDeleteClick(expense: Expense) {
    setConfirmingExpense(expense);
  }

  function confirmDelete() {
    if (!confirmingExpense) return;
    setUndoExpense(confirmingExpense);
    setUndoVisible(true);
    onDeleteExpense(confirmingExpense.id);
    setConfirmingExpense(null);
  }

  useEffect(() => {
    if (!undoVisible) return;
    const t = setTimeout(() => { setUndoVisible(false); setUndoExpense(null); }, 4000);
    return () => clearTimeout(t);
  }, [undoVisible]);

  function handleUndo() {
    if (undoExpense) { onAddExpense(undoExpense); setUndoExpense(null); setUndoVisible(false); }
  }

  async function emailReceipt(expense: Expense) {
    if (!user?.email) return;
    setEmailingId(expense.id);
    try {
      const res = await fetch('/.netlify/functions/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: user.email, expense, currency: budget.currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setEmailToast('Receipt emailed to ' + user.email);
    } catch (e) {
      setEmailToast(e instanceof Error ? e.message : 'Failed to send email');
    } finally {
      setEmailingId(null);
      setTimeout(() => setEmailToast(''), 4000);
    }
  }

  return (
    <div className="pb-4">
      {/* Hero section */}
      <div style={{ background: 'linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)' }} className="px-6 pt-12 pb-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-white/75 text-sm font-medium">{budget.tripName}</p>
            {budget.destination && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin size={12} className="text-white/60" />
                <span className="text-white/60 text-xs">{budget.destination}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowBudgetDialog(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Edit2 size={14} /> Edit
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/75 text-xs font-medium uppercase tracking-wide mb-1">Total Budget</p>
            <p className="text-white text-4xl font-bold tracking-tight">
              {formatCurrency(budget.totalAmount, budget.currency)}
            </p>
          </div>
          <DonutChart percent={percent} isOver={isOver} />
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="h-2 bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(percent * 100, 100)}%`,
                backgroundColor: isOver ? '#EF5350' : percent > 0.75 ? '#FFA726' : '#4CAF50',
              }}
            />
          </div>
          <p className="text-white/70 text-xs mt-1.5">{Math.round(percent * 100)}% of budget used</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="bg-white flex divide-x divide-slate-100 shadow-sm">
        <StatItem icon={<TrendingUp size={18} className="text-orange-400" />}
          label="Spent" value={formatCurrency(totalSpent, budget.currency)} valueClass="text-orange-500" />
        <StatItem
          icon={isOver
            ? <span className="text-red-400 text-lg">⚠️</span>
            : <PiggyBank size={18} className="text-green-400" />}
          label="Remaining"
          value={formatCurrency(Math.abs(remaining), budget.currency)}
          valueClass={isOver ? 'text-red-500' : 'text-green-600'}
          prefix={isOver ? '-' : ''}
        />
        <StatItem icon={<Receipt size={18} className="text-sky-400" />}
          label="Expenses" value={String(expenses.length)} valueClass="text-sky-600" />
      </div>

      {/* Category filters */}
      <div className="overflow-x-auto flex gap-2 px-4 py-3 bg-white border-b border-slate-100">
        <FilterChip label="All" active={filter === ALL} onClick={() => setFilter(ALL)} />
        {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map(cat => (
          <FilterChip
            key={cat} label={`${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label.split(' ')[0]}`}
            active={filter === cat} onClick={() => setFilter(filter === cat ? ALL : cat)}
          />
        ))}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h3 className="font-bold text-slate-800 text-lg">Expenses</h3>
        {filtered.length > 0 && (
          <span className="bg-sky-100 text-sky-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {filtered.length}
          </span>
        )}
      </div>

      {/* Expense list */}
      {filtered.length === 0 ? (
        <EmptyState onAdd={() => setShowExpenseDialog(true)} />
      ) : (
        <div className="px-4 space-y-3">
          {filtered.map(expense => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              currency={budget.currency}
              emailingId={emailingId}
              onEdit={() => setEditingExpense(expense)}
              onDelete={() => handleDeleteClick(expense)}
              onEmail={() => emailReceipt(expense)}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowExpenseDialog(true)}
        className="fixed bottom-20 left-4 flex items-center gap-2 text-white px-5 py-3 rounded-2xl shadow-lg font-semibold transition-all active:scale-95 z-40 opacity-50 hover:opacity-100 active:opacity-100"
        style={{ background: 'linear-gradient(135deg, #FF6B35, #FF4500)' }}
      >
        <Plus size={20} /> Add Expense
      </button>

      {/* Delete confirmation */}
      {confirmingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-[300]" onClick={() => setConfirmingExpense(null)}>
          <div className="bg-white w-full rounded-t-3xl p-6 pb-10" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 text-lg mb-1">Delete Expense?</h3>
            <p className="text-slate-500 text-sm mb-6">
              "{confirmingExpense.name}" will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingExpense(null)}
                className="flex-1 py-3 rounded-2xl font-semibold text-slate-600 bg-slate-100 active:bg-slate-200 transition-colors"
              >Cancel</button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-2xl font-semibold text-white bg-red-500 active:bg-red-600 transition-colors"
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo snackbar */}
      {undoVisible && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm z-50 slide-up">
          <span>Expense deleted</span>
          <button onClick={handleUndo} className="text-sky-400 font-bold">Undo</button>
        </div>
      )}

      {/* Email toast */}
      {emailToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-3 rounded-2xl shadow-xl text-sm z-50 slide-up max-w-xs text-center">
          {emailToast}
        </div>
      )}

      {/* Dialogs */}
      {showBudgetDialog && (
        <BudgetDialog budget={budget} onSave={b => { onUpdateBudget(b); setShowBudgetDialog(false); }} onClose={() => setShowBudgetDialog(false)} />
      )}
      {showExpenseDialog && (
        <ExpenseDialog expense={null} currency={budget.currency} destination={budget.destination}
          onSave={e => { onAddExpense(e); setShowExpenseDialog(false); }}
          onClose={() => setShowExpenseDialog(false)} />
      )}
      {editingExpense && (
        <ExpenseDialog expense={editingExpense} currency={budget.currency} destination={budget.destination}
          onSave={e => { onUpdateExpense(e); setEditingExpense(null); }}
          onClose={() => setEditingExpense(null)} />
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function DonutChart({ percent, isOver }: { percent: number; isOver: boolean }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const color = isOver ? '#EF5350' : percent > 0.75 ? '#FFA726' : '#4CAF50';
  const dash = circ - Math.min(percent, 1) * circ;

  return (
    <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
      <circle
        cx="45" cy="45" r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text
        x="45" y="45" textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize="13" fontWeight="bold"
        style={{ transform: 'rotate(90deg)', transformOrigin: '45px 45px' }}
      >
        {Math.min(Math.round(percent * 100), 999)}%
      </text>
    </svg>
  );
}

function StatItem({ icon, label, value, valueClass, prefix = '' }: {
  icon: React.ReactNode; label: string; value: string; valueClass: string; prefix?: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center py-4 gap-1">
      {icon}
      <span className={`font-bold text-base ${valueClass}`}>{prefix}{value}</span>
      <span className="text-slate-400 text-xs">{label}</span>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
        active
          ? 'bg-ocean text-white border-ocean'
          : 'bg-white text-slate-500 border-slate-200 hover:border-ocean hover:text-ocean'
      }`}
    >
      {label}
    </button>
  );
}

function ExpenseCard({ expense, currency, emailingId, onEdit, onDelete, onEmail }: {
  expense: Expense; currency: Currency; emailingId: string | null;
  onEdit: () => void; onDelete: () => void; onEmail: () => void;
}) {
  const meta = CATEGORY_META[expense.category];
  const isEmailing = emailingId === expense.id;

  const createdLabel = expense.createdAt
    ? new Date(expense.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden group">
      <div className="p-4 flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: meta.color + '20' }}
        >
          {meta.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{expense.name}</p>
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
            <MapPin size={11} />
            <span className="truncate">{expense.location || 'No location'}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{formatDate(expense.date)}</p>
          {createdLabel && (
            <p className="text-xs text-slate-300 mt-0.5">Added {createdLabel}</p>
          )}
          {expense.notes && <p className="text-xs text-slate-400 truncate mt-0.5 italic">"{expense.notes}"</p>}
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="font-bold text-base" style={{ color: '#FF6B35' }}>
            {formatCurrency(expense.amount, currency)}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: meta.color + '18', color: meta.color }}
          >
            {meta.label.split(' ')[0]}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            expense.paid ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'
          }`}>
            {expense.paid ? '✓ Paid' : 'Unpaid'}
          </span>
          <div className="flex gap-1 mt-1">
            <button onClick={onEdit} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <Pencil size={13} className="text-slate-400" />
            </button>
            <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} className="text-red-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Receipt section */}
      {expense.receiptUrl && (
        <div className="border-t border-slate-50 px-4 py-3 flex items-center gap-3">
          <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <img
              src={expense.receiptUrl}
              alt="Receipt"
              className="w-14 h-14 object-cover rounded-xl border border-slate-200 hover:opacity-80 transition-opacity"
            />
          </a>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Receipt attached</p>
            <div className="flex gap-2">
              <a
                href={expense.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-ocean font-medium px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <ExternalLink size={11} /> View
              </a>
              <button
                onClick={onEmail}
                disabled={isEmailing}
                className="flex items-center gap-1 text-xs text-violet-700 font-medium px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors disabled:opacity-50"
              >
                {isEmailing ? <Loader size={11} className="animate-spin" /> : <Mail size={11} />}
                {isEmailing ? 'Sending…' : 'Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center py-16 px-8 text-center">
      <span className="text-6xl mb-4">✈️</span>
      <p className="font-semibold text-slate-700 text-lg">No expenses yet</p>
      <p className="text-slate-400 text-sm mt-1">Tap the button below to add your first expense</p>
      <button
        onClick={onAdd}
        className="mt-6 flex items-center gap-2 border-2 border-dashed border-slate-300 text-slate-500 hover:border-ocean hover:text-ocean px-5 py-2.5 rounded-xl font-medium transition-colors"
      >
        <Plus size={18} /> Add Expense
      </button>
    </div>
  );
}
