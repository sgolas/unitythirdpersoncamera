import { useState, useEffect } from 'react';
import { X, FileText, Save, Plus } from 'lucide-react';
import { Expense, ExpenseCategory, CATEGORY_META, Currency, CURRENCY_SYMBOLS } from '../types';
import { Overlay } from './BudgetDialog';
import { LocationInput } from './LocationInput';
import { todayStr } from '../utils/formatters';

interface Props {
  expense: Expense | null;
  currency: Currency;
  onSave: (e: Expense) => void;
  onClose: () => void;
}

const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];
const DRAFT_KEY = 'draft_expense';

export function ExpenseDialog({ expense, currency, onSave, onClose }: Props) {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  const isEditing = expense !== null;

  // Load draft from sessionStorage only when creating a new expense
  function getInitial() {
    if (isEditing) return null;
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
  }
  const draft = getInitial();

  const [name,     setName]     = useState(expense?.name     ?? draft?.name     ?? '');
  const [amount,   setAmount]   = useState(expense ? expense.amount.toFixed(2) : (draft?.amount ?? ''));
  const [location, setLocation] = useState(expense?.location ?? draft?.location ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category  ?? draft?.category ?? 'OTHER');
  const [date,     setDate]     = useState(expense?.date     ?? draft?.date     ?? todayStr());
  const [notes,    setNotes]    = useState(expense?.notes    ?? draft?.notes    ?? '');
  const [nameErr,  setNameErr]  = useState(false);
  const [amtErr,   setAmtErr]   = useState(false);

  // Persist draft while user is typing (new expenses only)
  useEffect(() => {
    if (isEditing) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name, amount, location, category, date, notes }));
  }, [name, amount, location, category, date, notes, isEditing]);

  function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }

  function handleSave() {
    const parsed = parseFloat(amount);
    const ne = name.trim() === '';
    const ae = isNaN(parsed) || parsed <= 0;
    setNameErr(ne); setAmtErr(ae);
    if (ne || ae) return;
    clearDraft();
    onSave({
      id:       expense?.id ?? crypto.randomUUID(),
      name:     name.trim(),
      amount:   parsed,
      location: location.trim(),
      category,
      date,
      notes:    notes.trim(),
    });
  }

  function handleClose() { clearDraft(); onClose(); }

  return (
    <Overlay onClose={handleClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-slate-800">{isEditing ? 'Edit Expense' : 'New Expense'}</h2>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Category grid */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Category</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(cat => {
              const meta = CATEGORY_META[cat];
              const selected = cat === category;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                    selected ? 'border-ocean bg-blue-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xl">{meta.emoji}</span>
                  <span className={`text-xs mt-1 font-medium ${selected ? 'text-ocean' : 'text-slate-500'}`}>
                    {meta.label.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="field-label">Expense Name <span className="text-red-400">*</span></label>
            <input
              value={name} onChange={e => { setName(e.target.value); setNameErr(false); }}
              placeholder="e.g. Dinner at Le Jules Verne"
              className={`input-base ${nameErr ? 'border-red-400' : ''}`}
            />
            {nameErr && <p className="text-xs text-red-500 mt-1">Name is required</p>}
          </div>

          {/* Amount — prefix-box layout */}
          <div>
            <label className="field-label">Amount <span className="text-red-400">*</span></label>
            <div className={`flex items-stretch border rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-ocean/30 focus-within:border-ocean ${amtErr ? 'border-red-400' : 'border-slate-200'}`}>
              <span className="flex items-center px-4 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold text-sm select-none">
                {symbol}
              </span>
              <input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={e => { setAmount(e.target.value); setAmtErr(false); }}
                placeholder="0.00"
                className="flex-1 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-white"
              />
            </div>
            {amtErr && <p className="text-xs text-red-500 mt-1">Enter a valid amount</p>}
          </div>

          {/* Location with search + GPS */}
          <div>
            <label className="field-label">Location</label>
            <LocationInput
              value={location}
              onChange={setLocation}
              placeholder="Search for a place or use GPS…"
            />
          </div>

          {/* Date */}
          <div>
            <label className="field-label">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-base" />
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="relative">
              <FileText size={16} className="absolute left-3 top-3 text-slate-400" />
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Any extra details..."
                className="input-base pl-9 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleClose} className="btn-outline flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1 gap-2">
            {isEditing ? <><Save size={16} /> Update</> : <><Plus size={16} /> Add</>}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
