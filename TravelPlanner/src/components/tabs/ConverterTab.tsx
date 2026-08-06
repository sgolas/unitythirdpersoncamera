import { useEffect, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { CURRENCY_SYMBOLS, money1 } from '../../types';
import { convert, refreshRates, getRatesUpdatedAt, getHomeCurrency, getAwayCurrency } from '../../lib/currency';
import { TabHeader } from '../ui';

function agoLabel(at: number | null): string {
  if (!at) return 'using offline rates';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'updated just now';
  if (mins < 60) return `updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `updated ${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `updated ${days} day${days === 1 ? '' : 's'} ago`;
}

const CODES = Object.keys(CURRENCY_SYMBOLS);

export function ConverterTab() {
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState(getAwayCurrency());
  const [to, setTo] = useState(getHomeCurrency());
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);

  // Re-render when fresh rates land.
  useEffect(() => {
    const on = () => bump(x => x + 1);
    window.addEventListener('cur-change', on);
    return () => window.removeEventListener('cur-change', on);
  }, []);

  const amt = parseFloat(amount) || 0;
  const result = convert(amt, from, to);
  const rate = convert(1, from, to);
  const updatedAt = getRatesUpdatedAt();

  async function update() {
    setBusy(true);
    await refreshRates();
    setBusy(false);
  }
  function swap() { setFrom(to); setTo(from); }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Currency" subtitle="Live exchange rates"
        gradient="linear-gradient(135deg,#0f766e,#0ea5e9)" icon="💱" />

      <div className="px-4 py-5 space-y-4 max-w-md mx-auto">
        {/* Amount + From */}
        <div className="bg-surface rounded-3xl p-4 shadow-soft border border-line">
          <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Amount</p>
          <div className="flex items-center gap-3">
            <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="flex-1 min-w-0 bg-transparent text-3xl font-extrabold text-content outline-none" />
            <select value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-semibold text-content">
              {CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Swap */}
        <div className="flex justify-center -my-2 relative z-10">
          <button onClick={swap} aria-label="Swap currencies"
            className="w-11 h-11 rounded-full accent-gradient text-white flex items-center justify-center shadow-lg active:scale-90 transition">
            <ArrowLeftRight size={18} />
          </button>
        </div>

        {/* Result + To */}
        <div className="bg-surface rounded-3xl p-4 shadow-soft border border-line">
          <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Converts to</p>
          <div className="flex items-center gap-3">
            <p className="flex-1 min-w-0 text-3xl font-extrabold accent-text truncate">{money1(result, to)}</p>
            <select value={to} onChange={e => setTo(e.target.value)}
              className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-semibold text-content">
              {CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Rate + refresh */}
        <div className="bg-surface-2 rounded-2xl p-4 border border-line">
          <p className="text-content font-semibold">1 {from} = {money1(rate, to)}</p>
          <p className="text-xs text-muted mt-0.5">{money1(convert(1, to, from), from)} per 1 {to}</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted">Rates {agoLabel(updatedAt)}</span>
            <button onClick={update} disabled={busy}
              className="flex items-center gap-1.5 text-sm font-semibold text-accent px-3 py-1.5 rounded-xl bg-accent/10 active:bg-accent/20 disabled:opacity-50">
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Updating…' : 'Update rates'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted px-6">Rates are indicative, from a free public source — banks and cards may differ slightly.</p>
      </div>
    </div>
  );
}
