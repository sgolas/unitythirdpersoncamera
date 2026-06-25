import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Save, Plus, Sparkles, Loader, MapPin } from 'lucide-react';
import { Expense, ExpenseCategory, CATEGORY_META, Currency, CURRENCY_SYMBOLS } from '../types';
import { LocationInput } from './LocationInput';
import { todayStr } from '../utils/formatters';

interface Props {
  expense: Expense | null;
  currency: Currency;
  destination?: string;
  onSave: (e: Expense) => void;
  onClose: () => void;
}

const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];
const DRAFT_KEY = 'draft_expense';
const AI_CATEGORIES: ExpenseCategory[] = ['FOOD', 'ACCOMMODATION'];

interface PlaceSuggestion { name: string; address: string; description: string; }

export function ExpenseDialog({ expense, currency, destination, onSave, onClose }: Props) {
  const symbol    = CURRENCY_SYMBOLS[currency] ?? '$';
  const isEditing = expense !== null;

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

  // AI place finder state
  const [showAI,       setShowAI]       = useState(false);
  const [aiQuery,      setAiQuery]      = useState('');
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<PlaceSuggestion[]>([]);
  const [aiError,      setAiError]      = useState('');

  // Persist draft while typing (new expenses only)
  useEffect(() => {
    if (isEditing) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name, amount, location, category, date, notes }));
  }, [name, amount, location, category, date, notes, isEditing]);

  // Reset AI panel when category changes away from AI-supported ones
  useEffect(() => {
    if (!AI_CATEGORIES.includes(category)) { setShowAI(false); setAiSuggestions([]); }
  }, [category]);

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

  async function findWithAI() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      const res = await fetch('/.netlify/functions/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findPlaces: {
            category: CATEGORY_META[category].label,
            query: aiQuery,
          },
          destination,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setAiSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) setAiError('No results found. Try a different search.');
    } catch {
      setAiError('Could not fetch suggestions. Try again.');
    } finally {
      setAiLoading(false);
    }
  }

  function pickSuggestion(s: PlaceSuggestion) {
    setLocation(s.address);
    if (!name) setName(s.name);
    setShowAI(false);
    setAiSuggestions([]);
    setAiQuery('');
  }

  const showAIButton = AI_CATEGORIES.includes(category);

  return (
    // Full-screen fixed panel matching the app container
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col"
      style={{ maxWidth: 480, left: '50%', transform: 'translateX(-50%)' }}
    >
      {/* Sticky header */}
      <div
        className="flex items-center gap-3 px-4 py-4 border-b border-slate-100"
        style={{ background: 'linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)' }}
      >
        <button
          onClick={handleClose}
          className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors flex-shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-white flex-1">
          {isEditing ? 'Edit Expense' : 'New Expense'}
        </h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* Category grid */}
        <div>
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
            <span className="flex items-center px-4 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold text-sm select-none min-w-[3rem] justify-center">
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

        {/* Location with search + GPS + AI */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="field-label mb-0">Location</label>
            {showAIButton && (
              <button
                type="button"
                onClick={() => { setShowAI(s => !s); setAiSuggestions([]); setAiError(''); }}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  showAI ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600'
                }`}
              >
                <Sparkles size={11} /> Ask AI
              </button>
            )}
          </div>

          <LocationInput
            value={location}
            onChange={setLocation}
            placeholder="Search for a place or use GPS…"
          />

          {/* AI place finder panel */}
          {showAI && (
            <div className="mt-2 rounded-2xl border border-violet-200 bg-violet-50 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-violet-100">
                <Sparkles size={13} className="text-violet-600" />
                <span className="text-xs font-semibold text-violet-700">
                  AI {CATEGORY_META[category].label} Finder
                  {destination ? ` near ${destination}` : ''}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={aiQuery}
                    onChange={e => setAiQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') findWithAI(); }}
                    placeholder={category === 'FOOD' ? 'e.g. romantic Italian restaurant' : 'e.g. boutique hotel with pool'}
                    className="flex-1 text-sm border border-violet-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={findWithAI}
                    disabled={aiLoading || !aiQuery.trim()}
                    className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all active:scale-95 flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
                  >
                    {aiLoading ? <Loader size={14} className="animate-spin" /> : 'Find'}
                  </button>
                </div>

                {aiError && <p className="text-xs text-red-500">{aiError}</p>}

                {aiSuggestions.length > 0 && (
                  <div className="space-y-1.5 mt-1">
                    {aiSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="w-full text-left bg-white rounded-xl border border-violet-100 px-3 py-2.5 hover:border-violet-400 hover:bg-violet-50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <MapPin size={13} className="text-violet-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 leading-tight">{s.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{s.address}</p>
                            {s.description && <p className="text-xs text-slate-400 mt-0.5 italic">{s.description}</p>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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
              rows={3} placeholder="Any extra details..."
              className="input-base pl-9 resize-none"
            />
          </div>
        </div>

        {/* Bottom spacer so content clears the sticky footer */}
        <div className="h-4" />
      </div>

      {/* Sticky footer */}
      <div className="border-t border-slate-100 px-5 py-4 bg-white flex gap-3">
        <button onClick={handleClose} className="btn-outline flex-1">Cancel</button>
        <button onClick={handleSave} className="btn-primary flex-1 gap-2">
          {isEditing ? <><Save size={16} /> Update</> : <><Plus size={16} /> Add Expense</>}
        </button>
      </div>
    </div>
  );
}
