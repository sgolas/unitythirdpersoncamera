/**
 * Predictive car-name input: type a make or model and matching rental models
 * filter as you go. Choosing a suggestion fills the name (and notifies via
 * `onPick`); typing something with no match is kept verbatim as a custom name.
 */
import { useMemo, useState } from 'react';
import { TextInput } from './ui';
import { CAR_MODELS, type CarModel } from '../lib/cars';
import { FUEL_TYPES } from '../lib/fuel';

const norm = (s: string) => s.toLowerCase().replace(/[.\s-]/g, '');
const fuelEmoji = (f: CarModel['fuel']) => FUEL_TYPES.find(x => x.key === f)?.emoji ?? '';

export function CarNameInput({ value, onChange, onPick, placeholder, meta }: {
  value: string;
  onChange: (v: string) => void;          // free-text edits
  onPick?: (c: CarModel) => void;         // a suggestion was chosen
  placeholder?: string;
  meta?: (c: CarModel) => string;         // right-aligned muted label per row
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = norm(value.trim());
    const list = q ? CAR_MODELS.filter(c => norm(`${c.make} ${c.model}`).includes(q)) : CAR_MODELS;
    return list.slice(0, 40);
  }, [value]);

  return (
    <div className="relative">
      <TextInput value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        placeholder={placeholder} />
      {open && matches.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1.5 rounded-2xl border-2 border-sky/40 bg-white shadow-xl overflow-y-auto max-h-64">
          {matches.map(c => (
            <button key={c.id} type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(`${c.make} ${c.model}`); onPick?.(c); setOpen(false); }}
              className="w-full text-left px-3.5 py-2.5 hover:bg-sky/10 active:bg-sky/20 border-b border-slate-100 last:border-0 flex items-center justify-between gap-2">
              <span className="text-sm text-slate-700 truncate">{fuelEmoji(c.fuel)} {c.make} {c.model}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{meta ? meta(c) : (c.region === 'eu' ? 'EU' : 'NA')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
