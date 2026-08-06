import { useState } from 'react';
import { Search, Loader } from 'lucide-react';
import { Overlay } from './ui';
import { COUNTRIES, countryBounds, type Bounds } from '../lib/countries';

/**
 * Searchable country list — pick one and the map focuses on it.
 * Bounds come from the free geocoder (cached), so the first pick of a
 * country needs a connection; after that it's instant.
 */
export function CountryPicker({ onPick, onClose }: {
  onPick: (bounds: Bounds, name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const shown = COUNTRIES.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function pick(name: string) {
    setBusy(name); setErr('');
    const bounds = await countryBounds(name);
    setBusy('');
    if (!bounds) { setErr(`Couldn't locate ${name} — check your connection and try again.`); return; }
    onPick(bounds, name);
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
        <div className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
          <p className="font-bold text-content text-lg">Focus on a country</p>
          <p className="text-xs text-muted mb-3">The map will zoom to the country you pick</p>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search countries…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-line bg-surface-2 text-content outline-none focus:border-accent" />
          </div>
          {err && <p className="text-sunset text-xs mb-2">{err}</p>}
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {shown.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No matches</p>
            ) : shown.map(c => (
              <button key={c.code} onClick={() => pick(c.name)} disabled={!!busy}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-slate-50 transition text-left disabled:opacity-50">
                <span className="text-xl">{c.flag}</span>
                <span className="flex-1 font-semibold text-content">{c.name}</span>
                {busy === c.name && <Loader size={15} className="animate-spin text-muted" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
