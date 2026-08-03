/**
 * Card kit — shared interaction for the app's booking-style card lists:
 *   • single tap  → view (read-only DetailSheet)
 *   • press-and-hold → wiggle + Edit / Delete, and drag to reorder
 *   • a document (PDF or photo) attached per card
 *
 * Wrap a list in <ReorderProvider> and render each card as <HoldCard>. Build the
 * read-only view with <DetailSheet>, and add attachments in the edit form with
 * <DocField>. Matches the Stays / Activities / Fuel cards.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, GripVertical, FileText, Paperclip, X } from 'lucide-react';
import { Sheet } from './ui';
import { readFileAsDataUrl, compressImageToDataUrl, approxBytes, MAX_ATTACH_BYTES, isPdf } from '../lib/attachments';

/* ── Reorder coordination (list-level) ──────────────────────── */
interface Ctx {
  armedId: string | null;
  dragId: string | null;
  reorderable: boolean;
  setArmed: (id: string | null) => void;
  begin: (id: string, e: React.PointerEvent) => void;
  takeSuppress: () => boolean;
  setListEl: (el: HTMLDivElement | null) => void;
}
const ReorderCtx = createContext<Ctx | null>(null);

export function ReorderProvider({ ids, onReorder, className, children }: {
  ids: string[]; onReorder?: (ids: string[]) => void; className?: string; children: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const idsRef = useRef(ids); idsRef.current = ids;
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startY: number; moved: boolean } | null>(null);
  const hold = useRef<{ id: string; x: number; y: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const suppress = useRef(false);

  const clearHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } hold.current = null; };

  function begin(id: string, e: React.PointerEvent) {
    if (!onReorder) return;
    if (armedId === id) { drag.current = { id, startY: e.clientY, moved: false }; return; }
    hold.current = { id, x: e.clientX, y: e.clientY };
    clearHold();
    holdTimer.current = window.setTimeout(() => { setArmedId(id); suppress.current = true; hold.current = null; }, 450);
  }
  useEffect(() => {
    function move(e: PointerEvent) {
      const h = hold.current;
      if (h && (Math.abs(e.clientX - h.x) > 10 || Math.abs(e.clientY - h.y) > 10)) clearHold();
      const d = drag.current; if (!d) return;
      if (!d.moved && Math.abs(e.clientY - d.startY) > 6) { d.moved = true; setDragId(d.id); }
    }
    function up(e: PointerEvent) {
      clearHold();
      const d = drag.current; drag.current = null;
      if (d && d.moved) { commit(d.id, e.clientY); setDragId(null); suppress.current = true; }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function commit(id: string, clientY: number) {
    const cards = Array.from(listRef.current?.querySelectorAll('[data-card]') ?? []) as HTMLElement[];
    const mids = cards.map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.card!, mid: r.top + r.height / 2 }; });
    let idx = mids.findIndex(m => clientY < m.mid);
    if (idx === -1) idx = mids.length;
    const arr = [...idsRef.current];
    const cur = arr.indexOf(id);
    if (idx > cur) idx -= 1;
    if (cur < 0 || idx === cur) return;
    arr.splice(cur, 1); arr.splice(idx, 0, id);
    onReorder?.(arr);
  }

  const ctx: Ctx = {
    armedId, dragId, reorderable: !!onReorder, setArmed: setArmedId, begin,
    takeSuppress: () => { const s = suppress.current; suppress.current = false; return s; },
    setListEl: (el) => { listRef.current = el; },
  };
  return (
    <ReorderCtx.Provider value={ctx}>
      <div ref={ctx.setListEl} className={className}>{children}</div>
    </ReorderCtx.Provider>
  );
}

/* ── One card ───────────────────────────────────────────────── */
export function HoldCard({ id, accent = '#6366f1', hasDoc, onView, onEdit, onDelete, className = '', children }: {
  id: string; accent?: string; hasDoc?: boolean;
  onView?: () => void; onEdit?: () => void; onDelete?: () => void;
  className?: string; children: React.ReactNode;
}) {
  const ctx = useContext(ReorderCtx);
  const armed = ctx?.armedId === id;
  const dragging = ctx?.dragId === id;
  return (
    <div data-card={id}
      onPointerDown={e => ctx?.begin(id, e)}
      onClick={() => {
        if (ctx?.takeSuppress()) return;
        if (ctx?.dragId) return;
        if (armed) { ctx?.setArmed(null); return; }
        onView?.();
      }}
      className={`relative bg-white rounded-2xl p-4 shadow-sm active:bg-slate-50 transition ${armed ? 'animate-wiggle' : ''} ${dragging ? 'opacity-60 scale-[1.02]' : ''} ${className}`}
      style={{ touchAction: 'pan-y', boxShadow: armed ? `0 0 0 2px ${accent}` : undefined }}>
      {armed && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10" data-no-drag>
          <span className="text-slate-300" aria-hidden><GripVertical size={16} /></span>
          <button onClick={e => { e.stopPropagation(); ctx?.setArmed(null); onEdit?.(); }} aria-label="Edit"
            className="w-9 h-9 rounded-full text-white flex items-center justify-center shadow active:scale-90" style={{ background: accent }}><Pencil size={16} /></button>
          <button onClick={e => { e.stopPropagation(); ctx?.setArmed(null); onDelete?.(); }} aria-label="Delete"
            className="w-9 h-9 rounded-full bg-red-50 text-sunset flex items-center justify-center active:scale-90"><Trash2 size={16} /></button>
        </div>
      )}
      {!armed && hasDoc && <FileText size={14} className="absolute top-4 right-4 text-slate-300" aria-label="Has document" />}
      {children}
    </div>
  );
}

/** A hint line to show above a reorderable list (only when there's more than one). */
export function HoldHint({ count }: { count: number }) {
  if (count < 2) return null;
  return <p className="text-[11px] text-slate-400 text-center mb-2">Tap to view · press &amp; hold to edit, delete or drag</p>;
}

/* ── Read-only detail sheet ─────────────────────────────────── */
export interface DetailRow { icon?: React.ReactNode; label: string; value: React.ReactNode }
export function DetailSheet({ title, subtitle, rows, file, fileName, onViewDoc, note, onClose }: {
  title: string; subtitle?: React.ReactNode; rows: DetailRow[];
  file?: string; fileName?: string; onViewDoc?: () => void; note?: string; onClose: () => void;
}) {
  const shown = rows.filter(r => r.value !== '' && r.value != null && r.value !== false);
  return (
    <Sheet title={title} onClose={onClose}>
      {subtitle && <p className="text-grape font-semibold -mt-1 mb-2">{subtitle}</p>}
      <div className="bg-white rounded-2xl">
        {shown.map((r, i) => (
          <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
            {r.icon && <span className="text-slate-400 mt-0.5">{r.icon}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{r.label}</p>
              <p className="text-sm text-slate-700 font-medium break-words">{r.value}</p>
            </div>
          </div>
        ))}
      </div>
      {file && (
        <button onClick={onViewDoc}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-100 text-slate-700 font-semibold active:scale-[0.99] transition">
          <FileText size={18} /> View {isPdf(undefined, fileName) ? 'document' : 'attachment'}
        </button>
      )}
      {note && <p className="text-[11px] text-slate-400 text-center mt-3">{note}</p>}
    </Sheet>
  );
}

/* ── Attach-a-document control for edit forms ───────────────── */
export function DocField({ file, fileName, onPick, onClear }: {
  file?: string; fileName?: string;
  onPick: (dataUrl: string, name: string, mime: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr('');
    const url = /^image\//.test(f.type) ? await compressImageToDataUrl(f) : await readFileAsDataUrl(f);
    if (!url) { setErr('Could not read that file.'); return; }
    if (approxBytes(url) > MAX_ATTACH_BYTES) { setErr('That file is too large (max 12 MB).'); return; }
    onPick(url, f.name || 'document', f.type || 'application/octet-stream');
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">Document</span>
      <input ref={ref} type="file" accept="application/pdf,image/*,.pdf" hidden onChange={pick} />
      {file ? (
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
          <FileText size={16} className="text-slate-500 flex-shrink-0" />
          <span className="text-sm text-slate-700 truncate flex-1">{fileName || 'Attached document'}</span>
          <button type="button" onClick={() => ref.current?.click()} className="text-xs font-semibold text-grape px-1">Replace</button>
          <button type="button" onClick={onClear} aria-label="Remove document" className="text-slate-400 p-1"><X size={15} /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm font-semibold active:bg-slate-50">
          <Paperclip size={15} /> Attach a document (PDF or photo)
        </button>
      )}
      {err && <p className="text-xs text-sunset">{err}</p>}
    </div>
  );
}
