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

interface Sug { label: string; lat?: number; lng?: number }

/** Extra search keyword per hub tag, so a bare city name still finds its hubs. */
const HUB_SUFFIX: Record<string, string> = {
  'aeroway:aerodrome': 'airport',
  'railway:station': 'station',
  'amenity:bus_station': 'bus station',
  'amenity:ferry_terminal': 'ferry terminal',
};

function label(p: Record<string, string>): string {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name;
  const parts = [line1, p.city || p.county, p.state, p.country].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

export function PlaceInput({ value, onChange, placeholder, onPick, osmTags }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  onPick?: (coords: { lat: number; lng: number } | null, label: string) => void;
  /** Restrict suggestions to these OSM tags (OR'd), e.g.
   *  ['aeroway:aerodrome', 'railway:station'] for airports + train stations. */
  osmTags?: string[];
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
        const tags = (osmTags ?? []).map(tg => `&osm_tag=${encodeURIComponent(tg)}`).join('');
        // Hub searches also try "<query> airport" etc. — a plain city name
        // ("new york") often misses its airports without the keyword.
        const queries: string[] = [];
        for (const tg of osmTags ?? []) {
          const sfx = HUB_SUFFIX[tg];
          if (sfx && !q.toLowerCase().includes(sfx.split(' ').pop()!)) queries.push(`${q} ${sfx}`);
        }
        queries.push(q);
        type Feat = { properties: Record<string, string>; geometry?: { coordinates: [number, number] } };
        const results = await Promise.all(queries.map(qq =>
          fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(qq)}&limit=6&lang=en${tags}`, { signal: ctrl.signal })
            .then(r => r.json() as Promise<{ features?: Feat[] }>)
            .catch(() => ({ features: [] as Feat[] }))
        ));
        const seen = new Set<string>();
        const items = results.flatMap(d => d.features ?? [])
          .map(f => ({ label: label(f.properties), lng: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1] }))
          .filter(s => s.label && !seen.has(s.label) && seen.add(s.label))
          .slice(0, 8);
        setSugs(items);
        setOpen(items.length > 0);
      } catch { /* offline / aborted */ }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, osmTags?.join(',')]);

  function pick(s: Sug) {
    skip.current = true;
    onChange(s.label);
    onPick?.(s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null, s.label);
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
