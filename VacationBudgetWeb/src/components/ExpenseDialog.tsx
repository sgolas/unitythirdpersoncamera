import { useState } from 'react';
import { X, MapPin, FileText, Save, Plus } from 'lucide-react';
import { Expense, ExpenseCategory, CATEGORY_META, Currency, CURRENCY_SYMBOLS } from '../types';
import { Overlay } from './BudgetDialog';
import { todayStr } from '../utils/formatters';

interface Props {
  expense: Expense | null;
  currency: Currency;
  onSave: (e: Expense) => void;
  onClose: () => void;
}

const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];

export function ExpenseDialog({ expense, currency, onSave, onClose }: Props) {
  const [name,     setName]     = useState(expense?.name ?? '');
  const [amount,   setAmount]   = useState(expense ? expense.amount.toFixed(2) : '');
  const [location, setLocation] = useState(expense?.location ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'OTHER');
  const [date,     setDate]     = useState(expense?.date ?? todayStr());
  const [notes,    setNotes]    = useState(expense?.notes ?? '');
  const [nameErr,  setNameErr]  = useState(false);
  const [amtErr,   setAmtErr]   = useState(false);

  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  const isEditing = expense !== null;

  function handleSave() {
    const parsed = parseFloat(amount);
    const ne = name.trim() === '';
    const ae = isNaN(parsed) || parsed <= 0;
    setNameErr(ne); setAmtErr(ae);
    if (ne || ae) return;
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

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-slate-800">{isEditing ? 'Edit Expense' : 'New Expense'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
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
                    selected
                      ? 'border-ocean bg-blue-50'
                      : 'border-transparent bg-slate-50 hover:bg-slate-100'
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

          {/* Amount */}
          <div>
            <label className="field-label">Amount <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm">{symbol}</span>
              <input
                type="number" min="0" step="0.01"
                value={amount} onChange={e => { setAmount(e.target.value); setAmtErr(false); }}
                placeholder="0.00"
                className={`input-base pl-8 ${amtErr ? 'border-red-400' : ''}`}
              />
            </div>
            {amtErr && <p className="text-xs text-red-500 mt-1">Enter a valid amount</p>}
          </div>

          {/* Location */}
          <div>
            <label className="field-label">Location</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Eiffel Tower, Paris"
                className="input-base pl-9"
              />
            </div>
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
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1 gap-2">
            {isEditing ? <><Save size={16} /> Update</> : <><Plus size={16} /> Add</>}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
