import { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  const listRef = useRef<HTMLDivElement>(null);

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

  // When suggestions open, make sure the whole list is scrolled into view.
  useLayoutEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open, sugs.length]);

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => sugs.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        autoComplete="off"
      />
      {open && sugs.length > 0 && (
        <div ref={listRef}
          className="mt-1.5 rounded-2xl border-2 border-sky/40 bg-white shadow-xl overflow-y-auto max-h-72">
          {sugs.map((s, i) => (
            <button key={i} type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}
              className="w-full text-left px-4 py-3.5 text-[15px] leading-snug text-slate-700 hover:bg-sky/10 active:bg-sky/20 flex items-center gap-3 border-b border-slate-100 last:border-0">
              <MapPin size={18} className="text-sky flex-shrink-0" />
              <span className="break-words">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
