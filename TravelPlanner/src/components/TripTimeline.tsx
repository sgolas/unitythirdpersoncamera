/**
 * TripTimeline — a horizontal, date-ordered timeline of a trip.
 *
 * A dashed route line runs left→right with a dot for each stop; under each dot
 * sits the city name and its date range. Stops scroll sideways when they
 * overflow. Below the line is an editable legend of stop "types".
 *
 * The component is self-contained and portable: it carries its own editorial
 * palette (scoped CSS vars, light + dark) and needs no external UI kit. It is
 * *controlled* — the parent owns the data and receives edits through callbacks
 * — but pass no handlers (or render <TripTimelineDemo/>) to see it working with
 * the built-in seed data immediately.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Trash2, GripVertical, Pencil, Check } from 'lucide-react';
import type { TimelineLegendItem, TimelineSwatch, TimelineColor } from '../types';

/* A stop as shown on the line. Stay-backed stops are locked (read-only here);
 * `extra` stops map to an editable TimelineStop record. */
export interface UnifiedStop {
  id: string;
  city: string;
  startDate: string;
  endDate: string | null;
  type: string;
  tags: string[];
  locked: boolean;               // true = derived from a Stay, not editable here
  source: 'stay' | 'extra';
}

export interface StopPatch {
  city: string;
  startDate: string;
  endDate: string | null;
  type: string;
  tags: string[];
}

export interface TripTimelineProps {
  stops: UnifiedStop[];
  legend: TimelineLegendItem[];
  /** Persist an edit to an existing extra stop. */
  onSaveStop?: (id: string, patch: StopPatch) => void;
  /** Create a new extra stop (dates already chosen to sit at the drop point). */
  onAddStop?: (patch: StopPatch) => void;
  onDeleteStop?: (id: string) => void;
  /** Reorder: an extra stop was dragged; its dates were re-flowed to match. */
  onReorderStop?: (id: string, startDate: string, endDate: string | null, order: number) => void;
  onSaveLegend?: (item: TimelineLegendItem) => void;
  onAddLegend?: (item: TimelineLegendItem) => void;
  onDeleteLegend?: (id: string) => void;
  readOnly?: boolean;
}

/* ── Date helpers (self-contained) ──────────────────────────── */
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const effEnd = (s: { startDate: string; endDate: string | null }) => s.endDate || s.startDate;
const durDays = (s: { startDate: string; endDate: string | null }) =>
  s.endDate ? Math.max(0, Math.round((+new Date(s.endDate) - +new Date(s.startDate)) / 86_400_000)) : 0;
const today = () => new Date().toISOString().slice(0, 10);
function fmtRange(start: string, end: string | null): string {
  const f = (iso: string, withYear = false) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
  if (!start) return '';
  if (!end || end === start) return f(start);
  return `${f(start)} – ${f(end)}`;
}

/* ── Colour tokens → theme-aware CSS vars ───────────────────── */
const TOKENS: Record<string, string> = {
  route: 'var(--tl-route)', accent: 'var(--tl-accent)', ink: 'var(--tl-ink)',
  paper: 'var(--tl-paper)', muted: 'var(--tl-muted)',
};
const col = (c: TimelineColor | undefined) => (c ? TOKENS[c] ?? c : 'transparent');
const SWATCH_PRESETS: { name: string; swatch: TimelineSwatch }[] = [
  { name: 'Overnight', swatch: { fill: 'route' } },
  { name: 'Day stop', swatch: { fill: 'paper', border: 'accent', borderWidth: 3 } },
  { name: 'End', swatch: { fill: 'ink' } },
  { name: 'Buffer', swatch: { fill: 'paper', border: 'muted', borderWidth: 3 } },
  { name: 'Accent', swatch: { fill: 'accent' } },
];

/* Render a single dot from a swatch. `size` is the circle diameter. */
function Dot({ swatch, size = 14, ring = true }: { swatch: TimelineSwatch; size?: number; ring?: boolean }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block',
      background: col(swatch.fill),
      border: swatch.border ? `${swatch.borderWidth ?? 3}px solid ${col(swatch.border)}` : 'none',
      // 5px --paper ring lets the dot punch through the route line behind it.
      boxShadow: ring ? '0 0 0 5px var(--tl-paper)' : 'none',
    }} />
  );
}

const NEUTRAL: TimelineSwatch = { fill: 'muted' };

/* Editorial palette, scoped to the component. Light + a matching dark variant.
 * Applied inline (so the component is portable without the app stylesheet) and
 * chosen from the live theme, since inline vars would otherwise beat any
 * `.dark` stylesheet rule and freeze the timeline in its light look. */
const LIGHT_VARS: React.CSSProperties = {
  ['--tl-paper' as any]: '#F4F1E9', ['--tl-ink' as any]: '#23302E',
  ['--tl-route' as any]: '#13595C', ['--tl-accent' as any]: '#DDA53A',
  ['--tl-muted' as any]: '#6E7B76', ['--tl-line' as any]: '#DAD3C4',
};
const DARK_VARS: React.CSSProperties = {
  ['--tl-paper' as any]: '#1B2422', ['--tl-ink' as any]: '#E8ECEA',
  ['--tl-route' as any]: '#4FB3B6', ['--tl-accent' as any]: '#E6B455',
  ['--tl-muted' as any]: '#9AA8A2', ['--tl-line' as any]: '#2C3A37',
};
/** Track the app's dark theme (a `dark` class on <html>) so the palette follows it. */
function useThemeVars(): React.CSSProperties {
  const read = () => typeof document !== 'undefined'
    && (document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'));
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const update = () => setDark(read());
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    update();
    return () => obs.disconnect();
  }, []);
  return dark ? DARK_VARS : LIGHT_VARS;
}

/* ── Seed data (for standalone/demo use) ────────────────────── */
export const SEED_LEGEND: TimelineLegendItem[] = [
  { kind: 'timelinelegend', id: 'lg-overnight', key: 'overnight', label: 'Overnight', swatch: { fill: 'route' }, order: 0, builtin: true, updatedAt: '', updatedBy: '' },
  { kind: 'timelinelegend', id: 'lg-day', key: 'day', label: 'Day stop', swatch: { fill: 'paper', border: 'accent', borderWidth: 3 }, order: 1, builtin: true, updatedAt: '', updatedBy: '' },
  { kind: 'timelinelegend', id: 'lg-end', key: 'end', label: 'End', swatch: { fill: 'ink' }, order: 2, builtin: true, updatedAt: '', updatedBy: '' },
  { kind: 'timelinelegend', id: 'lg-buffer', key: 'buffer', label: 'Buffer', swatch: { fill: 'paper', border: 'muted', borderWidth: 3 }, order: 3, updatedAt: '', updatedBy: '' },
];
export const SEED_STOPS: UnifiedStop[] = [
  { id: 's1', city: 'Lisbon', startDate: '2026-09-02', endDate: '2026-09-05', type: 'overnight', tags: [], locked: false, source: 'extra' },
  { id: 's2', city: 'Sintra', startDate: '2026-09-06', endDate: null, type: 'day', tags: ['day'], locked: false, source: 'extra' },
  { id: 's3', city: 'Porto', startDate: '2026-09-07', endDate: '2026-09-10', type: 'overnight', tags: [], locked: false, source: 'extra' },
  { id: 's4', city: 'Douro Valley', startDate: '2026-09-11', endDate: null, type: 'buffer', tags: ['buffer'], locked: false, source: 'extra' },
  { id: 's5', city: 'Madrid', startDate: '2026-09-12', endDate: '2026-09-15', type: 'end', tags: [], locked: false, source: 'extra' },
];

/* ─────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────── */
export function TripTimeline(props: TripTimelineProps) {
  const { stops, legend, readOnly } = props;
  const themeVars = useThemeVars();
  const legendByKey = useMemo(() => {
    const m: Record<string, TimelineLegendItem> = {};
    for (const l of legend) m[l.key] = l;
    return m;
  }, [legend]);
  const swatchFor = (type: string) => legendByKey[type]?.swatch ?? NEUTRAL;

  const sorted = useMemo(
    () => [...stops].sort((a, b) => a.startDate.localeCompare(b.startDate)
      || (a.source === b.source ? 0 : a.source === 'stay' ? -1 : 1)
      || a.city.localeCompare(b.city)),
    [stops],
  );

  const [editing, setEditing] = useState<UnifiedStop | null>(null);
  const [adding, setAdding] = useState(false);
  const [lockedInfo, setLockedInfo] = useState<UnifiedStop | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  /* ── Drag-to-reorder (extra stops only) ──────────────────── */
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; moved: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent, stop: UnifiedStop) {
    if (readOnly || stop.locked) return;
    drag.current = { id: stop.id, startX: e.clientX, moved: false };
  }
  useEffect(() => {
    function move(e: PointerEvent) {
      const d = drag.current; if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.startX) > 6) { d.moved = true; setDragId(d.id); }
    }
    function up(e: PointerEvent) {
      const d = drag.current; drag.current = null;
      if (!d) return;
      if (d.moved) { commitDrop(d.id, e.clientX); setDragId(null); }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted]);

  /* Work out where the pointer dropped and re-flow the stop's dates so the
   * line stays consistent with the calendar. */
  function commitDrop(id: string, clientX: number) {
    const cols = Array.from(trackRef.current?.querySelectorAll('[data-sk]') ?? []) as HTMLElement[];
    const centers = cols.map(c => { const r = c.getBoundingClientRect(); return { key: c.dataset.sk!, x: r.left + r.width / 2 }; });
    let idx = centers.findIndex(c => clientX < c.x);
    if (idx === -1) idx = centers.length;
    const without = sorted.filter(s => s.id !== id);
    // idx counts positions in the *rendered* (with-dragged) list; map to `without`.
    const curIdx = sorted.findIndex(s => s.id === id);
    if (idx > curIdx) idx -= 1;
    const prev = without[idx - 1];
    const next = without[idx];
    const moving = sorted.find(s => s.id === id)!;
    const dur = durDays(moving);
    let start: string, end: string | null;
    if (prev && next) {
      start = addDays(effEnd(prev), 1);
      if (start > next.startDate) start = next.startDate;
      end = dur > 0 ? addDays(start, dur) : null;
      if (end && end >= next.startDate) end = null;
    } else if (prev) {
      start = addDays(effEnd(prev), 1);
      end = dur > 0 ? addDays(start, dur) : null;
    } else if (next) {
      start = addDays(next.startDate, -1 - dur);
      end = dur > 0 ? addDays(start, dur) : null;
    } else { start = moving.startDate; end = moving.endDate; }
    props.onReorderStop?.(id, start, end, idx);
  }

  return (
    <div className="tl-scope" style={themeVars}>
     <div className="tl-card">
      {/* Timeline track */}
      <div ref={trackRef} className="tl-track" role="list" aria-label="Trip timeline"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div className="tl-inner">
          {/* Dashed route line, behind the dots */}
          {sorted.length > 0 && <div className="tl-line" />}
          {sorted.map(stop => {
            const sw = swatchFor(stop.type);
            const isDrag = dragId === stop.id;
            return (
              <div key={stop.id} data-sk={stop.id} role="listitem"
                className={`tl-col${isDrag ? ' tl-col--drag' : ''}`}>
                <div className="tl-dotrow">
                  <button
                    type="button"
                    className="tl-dotbtn"
                    onPointerDown={e => onPointerDown(e, stop)}
                    onClick={() => {
                      if (drag.current?.moved) return;
                      if (stop.locked) setLockedInfo(stop);
                      else if (!readOnly) setEditing(stop);
                    }}
                    aria-label={`${stop.city}, ${fmtRange(stop.startDate, stop.endDate)}${stop.locked ? ', from Stays' : ''}`}
                    title={stop.locked ? 'From Stays — edit on the Stays page' : 'Edit stop'}
                  >
                    <Dot swatch={sw} />
                  </button>
                </div>
                <div className="tl-city">{stop.city || '—'}</div>
                <div className="tl-dates">{fmtRange(stop.startDate, stop.endDate)}</div>
                {(stop.tags.length > 0 || stop.locked) && (
                  <div className="tl-tags">
                    {stop.tags.map(t => <span key={t} className="tl-pill">{t}</span>)}
                    {stop.locked && <span className="tl-pill tl-pill--muted">stay</span>}
                  </div>
                )}
                {!readOnly && !stop.locked && (
                  <span className="tl-grip" aria-hidden><GripVertical size={12} /></span>
                )}
              </div>
            );
          })}

          {/* Add-stop affordance at the end of the line */}
          {!readOnly && (
            <div className="tl-col tl-col--add">
              <div className="tl-dotrow">
                <button type="button" className="tl-addbtn" onClick={() => setAdding(true)} aria-label="Add a stop">
                  <Plus size={16} />
                </button>
              </div>
              <div className="tl-city tl-addlabel">Add stop</div>
            </div>
          )}
        </div>
      </div>

      {/* Swipe hint (mobile, when it overflows) */}
      {sorted.length > 3 && <div className="tl-swipe" aria-hidden>swipe →</div>}

      {/* Legend */}
      <div className="tl-legend">
        <div className="tl-legend-head">
          <span className="tl-legend-title">Legend</span>
          {!readOnly && (
            <button type="button" className="tl-textbtn" onClick={() => setLegendOpen(o => !o)}>
              {legendOpen ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        <div className="tl-legend-items">
          {legend.map(l => (
            <span key={l.id} className="tl-legend-item">
              <Dot swatch={l.swatch} size={12} ring={false} />
              <span className="tl-legend-label">{l.label}</span>
            </span>
          ))}
        </div>
      </div>
     </div>

      {/* Editors */}
      {editing && (
        <StopEditor
          stop={editing} legend={legend}
          onClose={() => setEditing(null)}
          onSave={patch => { props.onSaveStop?.(editing.id, patch); setEditing(null); }}
          onDelete={() => { props.onDeleteStop?.(editing.id); setEditing(null); }}
        />
      )}
      {adding && (
        <StopEditor
          stop={null} legend={legend}
          defaultStart={sorted.length ? addDays(effEnd(sorted[sorted.length - 1]), 1) : today()}
          onClose={() => setAdding(false)}
          onSave={patch => { props.onAddStop?.(patch); setAdding(false); }}
        />
      )}
      {lockedInfo && (
        <InfoSheet title={lockedInfo.city} onClose={() => setLockedInfo(null)}>
          <p>{fmtRange(lockedInfo.startDate, lockedInfo.endDate)}</p>
          <p className="tl-note">This stop comes from your <strong>Stays</strong>. To change its
            city or dates, edit or remove that stay on the Stays page.</p>
        </InfoSheet>
      )}
      {legendOpen && (
        <LegendEditor
          legend={legend}
          onClose={() => setLegendOpen(false)}
          onSave={props.onSaveLegend} onAdd={props.onAddLegend} onDelete={props.onDeleteLegend}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Stop editor (add / edit an extra stop)
   ───────────────────────────────────────────────────────────── */
function StopEditor({ stop, legend, defaultStart, onClose, onSave, onDelete }: {
  stop: UnifiedStop | null;
  legend: TimelineLegendItem[];
  defaultStart?: string;
  onClose: () => void;
  onSave: (patch: StopPatch) => void;
  onDelete?: () => void;
}) {
  const [city, setCity] = useState(stop?.city ?? '');
  const [start, setStart] = useState(stop?.startDate ?? defaultStart ?? today());
  const [multi, setMulti] = useState(!!stop?.endDate);
  const [end, setEnd] = useState(stop?.endDate ?? '');
  const [type, setType] = useState(stop?.type ?? legend[0]?.key ?? 'day');
  const [tags, setTags] = useState((stop?.tags ?? []).join(', '));

  function save() {
    if (!city.trim()) return;
    const endDate = multi && end ? end : null;
    onSave({
      city: city.trim(), startDate: start,
      endDate: endDate && endDate >= start ? endDate : null,
      type, tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    });
  }

  return (
    <Modal title={stop ? 'Edit stop' : 'Add stop'} onClose={onClose}>
      <label className="tl-field"><span>City</span>
        <input className="tl-input" autoFocus value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Porto" /></label>
      <div className="tl-row2">
        <label className="tl-field"><span>Start date</span>
          <input className="tl-input" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="tl-field"><span>End date</span>
          <input className="tl-input" type="date" value={end} disabled={!multi} min={start}
            onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <label className="tl-check">
        <input type="checkbox" checked={multi} onChange={e => { setMulti(e.target.checked); if (e.target.checked && !end) setEnd(start); }} />
        <span>Spans multiple days</span>
      </label>
      <div className="tl-field"><span>Type</span>
        <div className="tl-typegrid">
          {legend.map(l => (
            <button key={l.key} type="button"
              className={`tl-typechip${type === l.key ? ' tl-typechip--on' : ''}`}
              onClick={() => setType(l.key)}>
              <Dot swatch={l.swatch} size={11} ring={false} />{l.label}
            </button>
          ))}
        </div>
      </div>
      <label className="tl-field"><span>Tags</span>
        <input className="tl-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="comma, separated" /></label>
      <div className="tl-actions">
        {onDelete && <button type="button" className="tl-btn tl-btn--danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>}
        <div className="tl-actions-right">
          <button type="button" className="tl-btn tl-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="tl-btn tl-btn--primary" onClick={save} disabled={!city.trim()}>
            {stop ? 'Save' : 'Add stop'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────
   Legend editor
   ───────────────────────────────────────────────────────────── */
function LegendEditor({ legend, onClose, onSave, onAdd, onDelete }: {
  legend: TimelineLegendItem[];
  onClose: () => void;
  onSave?: (i: TimelineLegendItem) => void;
  onAdd?: (i: TimelineLegendItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [newLabel, setNewLabel] = useState('');
  const [newSwatch, setNewSwatch] = useState<TimelineSwatch>(SWATCH_PRESETS[0].swatch);

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';

  function add() {
    const label = newLabel.trim(); if (!label) return;
    let key = slug(label);
    const taken = new Set(legend.map(l => l.key));
    while (taken.has(key)) key += '-x';
    onAdd?.({
      kind: 'timelinelegend', id: crypto.randomUUID(), key, label, swatch: newSwatch,
      order: legend.length, updatedAt: '', updatedBy: '',
    });
    setNewLabel('');
  }

  return (
    <Modal title="Edit legend" onClose={onClose}>
      <div className="tl-leglist">
        {legend.map(l => (
          <LegendRow key={l.id} item={l} onSave={onSave} onDelete={onDelete} />
        ))}
      </div>
      <div className="tl-legadd">
        <div className="tl-field"><span>New type</span>
          <input className="tl-input" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Rest day" /></div>
        <div className="tl-field"><span>Style</span>
          <div className="tl-swatchrow">
            {SWATCH_PRESETS.map(p => (
              <button key={p.name} type="button" title={p.name}
                className={`tl-swatchbtn${sameSwatch(p.swatch, newSwatch) ? ' tl-swatchbtn--on' : ''}`}
                onClick={() => setNewSwatch(p.swatch)}>
                <Dot swatch={p.swatch} size={14} ring={false} />
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="tl-btn tl-btn--primary" onClick={add} disabled={!newLabel.trim()}>
          <Plus size={15} /> Add type
        </button>
      </div>
    </Modal>
  );
}

function sameSwatch(a: TimelineSwatch, b: TimelineSwatch) {
  return a.fill === b.fill && a.border === b.border && (a.borderWidth ?? 0) === (b.borderWidth ?? 0);
}

function LegendRow({ item, onSave, onDelete }: {
  item: TimelineLegendItem;
  onSave?: (i: TimelineLegendItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [swatch, setSwatch] = useState<TimelineSwatch>(item.swatch);

  if (editing) {
    return (
      <div className="tl-legrow">
        <input className="tl-input tl-input--sm" value={label} onChange={e => setLabel(e.target.value)} />
        <div className="tl-swatchrow">
          {SWATCH_PRESETS.map(p => (
            <button key={p.name} type="button" title={p.name}
              className={`tl-swatchbtn${sameSwatch(p.swatch, swatch) ? ' tl-swatchbtn--on' : ''}`}
              onClick={() => setSwatch(p.swatch)}>
              <Dot swatch={p.swatch} size={12} ring={false} />
            </button>
          ))}
        </div>
        <button type="button" className="tl-iconbtn" aria-label="Save"
          onClick={() => { onSave?.({ ...item, label: label.trim() || item.label, swatch }); setEditing(false); }}>
          <Check size={15} />
        </button>
      </div>
    );
  }
  return (
    <div className="tl-legrow">
      <Dot swatch={item.swatch} size={13} ring={false} />
      <span className="tl-legrow-label">{item.label}{item.builtin && <em className="tl-builtin"> · built-in</em>}</span>
      {onSave && <button type="button" className="tl-iconbtn" aria-label="Rename" onClick={() => setEditing(true)}><Pencil size={13} /></button>}
      {onDelete && !item.builtin && (
        <button type="button" className="tl-iconbtn tl-iconbtn--danger" aria-label="Remove" onClick={() => onDelete(item.id)}><Trash2 size={13} /></button>
      )}
    </div>
  );
}

/* ── Lightweight modal + info sheet (self-contained) ────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const themeVars = useThemeVars();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="tl-scope tl-modal-backdrop" style={themeVars} onClick={onClose}>
      <div className="tl-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="tl-modal-head">
          <h3>{title}</h3>
          <button type="button" className="tl-iconbtn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="tl-modal-body">{children}</div>
      </div>
    </div>
  );
}
function InfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal title={title} onClose={onClose}><div className="tl-info">{children}</div></Modal>;
}

/* ── Standalone demo (internal state + seed data) ───────────── */
export function TripTimelineDemo() {
  const [stops, setStops] = useState<UnifiedStop[]>(SEED_STOPS);
  const [legend, setLegend] = useState<TimelineLegendItem[]>(SEED_LEGEND);
  return (
    <TripTimeline
      stops={stops}
      legend={legend}
      onSaveStop={(id, p) => setStops(s => s.map(x => x.id === id ? { ...x, ...p } : x))}
      onAddStop={p => setStops(s => [...s, { id: crypto.randomUUID(), locked: false, source: 'extra', ...p }])}
      onDeleteStop={id => setStops(s => s.filter(x => x.id !== id))}
      onReorderStop={(id, startDate, endDate) => setStops(s => s.map(x => x.id === id ? { ...x, startDate, endDate } : x))}
      onSaveLegend={i => setLegend(l => l.map(x => x.id === i.id ? i : x))}
      onAddLegend={i => setLegend(l => [...l, i])}
      onDeleteLegend={id => setLegend(l => l.filter(x => x.id !== id))}
    />
  );
}
