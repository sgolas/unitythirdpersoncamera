import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

/**
 * A text input with live place/address/city suggestions.
 *
 * Uses the free Photon geocoder (OpenStreetMap data) — type 3+ characters and
 * a dropdown of matching places appears. Picking one fills the field. No API
 * key required. Works for the location, city and address fields.
 */
const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky focus:ring-2 focus:ring-sky/20 outline-none transition text-slate-800';

interface Sug { label: string }

function label(p: Record<string, string>): string {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name;
  const parts = [line1, p.city || p.county, p.state, p.country].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

export function PlaceInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const skip = useRef(false); // don't re-search right after a pick

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const q = value.trim();
    if (q.length < 3) { setSugs([]); setOpen(false); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal });
        const d = await r.json() as { features?: { properties: Record<string, string> }[] };
        const seen = new Set<string>();
        const items = (d.features ?? [])
          .map(f => ({ label: label(f.properties) }))
          .filter(s => s.label && !seen.has(s.label) && seen.add(s.label));
        setSugs(items);
        setOpen(items.length > 0);
      } catch { /* offline / aborted */ }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  function pick(s: Sug) {
    skip.current = true;
    onChange(s.label);
    setOpen(false);
    setSugs([]);
  }

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => sugs.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && sugs.length > 0 && (
        <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {sugs.map((s, i) => (
            <button key={i} type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 flex items-center gap-2 border-b border-slate-50 last:border-0">
              <MapPin size={13} className="text-slate-400 flex-shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
