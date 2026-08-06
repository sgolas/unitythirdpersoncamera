import { useState } from 'react';
import { X, Luggage, MapPin, DollarSign, Lightbulb, Save } from 'lucide-react';
import { Budget, CURRENCIES, Currency } from '../types';

interface Props {
  budget: Budget;
  onSave: (b: Budget) => void;
  onClose: () => void;
}

export function BudgetDialog({ budget, onSave, onClose }: Props) {
  const [tripName,    setTripName]    = useState(budget.tripName);
  const [destination, setDestination] = useState(budget.destination);
  const [amount,      setAmount]      = useState(budget.totalAmount > 0 ? budget.totalAmount.toFixed(2) : '');
  const [currency,    setCurrency]    = useState<Currency>(budget.currency);
  const [amountErr,   setAmountErr]   = useState(false);

  function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { setAmountErr(true); return; }
    onSave({ tripName: tripName.trim() || 'My Vacation', destination: destination.trim(), totalAmount: parsed, currency });
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-slate-800">Trip Budget</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <Field icon={<Luggage size={18} className="text-slate-400" />} label="Trip Name">
            <input
              value={tripName} onChange={e => setTripName(e.target.value)}
              placeholder="e.g. Europe Summer 2025"
              className="input-base"
            />
          </Field>

          <Field icon={<MapPin size={18} className="text-slate-400" />} label="Destination">
            <input
              value={destination} onChange={e => setDestination(e.target.value)}
              placeholder="e.g. Paris, France"
              className="input-base"
            />
          </Field>

          <div className="flex gap-3">
            <div className="w-28">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Currency</label>
              <select
                value={currency} onChange={e => setCurrency(e.target.value as Currency)}
                className="input-base"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                Total Budget <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number" min="0" step="0.01"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setAmountErr(false); }}
                  placeholder="0.00"
                  className={`input-base pl-8 ${amountErr ? 'border-red-400' : ''}`}
                />
              </div>
              {amountErr && <p className="text-xs text-red-500 mt-1">Enter a valid amount</p>}
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
            <Lightbulb size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
            <span>Add 10–15% buffer for unexpected costs on top of your planned budget.</span>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1 gap-2">
            <Save size={16} /> Save Budget
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        <div className="[&>input]:pl-9 [&>select]:pl-9">{children}</div>
      </div>
    </div>
  );
}

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md slide-up sm:fade-in">{children}</div>
    </div>
  );
}
