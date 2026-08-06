import { useState, useRef, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { Overlay } from './ui';

export interface SortItem { key: string; node: React.ReactNode }

/**
 * Home-screen style reorderable grid. Press and hold any tile to enter edit
 * mode (tiles wiggle), then drag to reposition — the others make room. Order is
 * saved per device under `storageKey`. An optional `badge` renders an overlay
 * on each tile in edit mode (e.g. a pin toggle); mark interactive bits inside a
 * tile with `data-no-drag` so tapping them doesn't start a drag.
 */
export function SortableGrid({ items, storageKey, className = '', hint = true, badge }: {
  items: SortItem[];
  storageKey: string;
  className?: string;
  hint?: boolean;
  badge?: (key: string, edit: boolean) => React.ReactNode;
}) {
  const all = items.map(i => i.key);
  const [order, setOrder] = useState<string[]>(() => loadOrder(storageKey, all));
  const [edit, setEdit] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [pt, setPt] = useState({ x: 0, y: 0 });
  const grab = useRef<{ ox: number; oy: number; w: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order); orderRef.current = order;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const byKey = new Map(items.map(i => [i.key, i.node]));

  // Keep the saved order valid if the set of tiles changes.
  useEffect(() => {
    setOrder(o => {
      const next = [...o.filter(k => all.includes(k)), ...all.filter(k => !o.includes(k))];
      return next.length === o.length && next.every((k, i) => k === o[i]) ? o : next;
    });
  }, [all.join('|')]);

  // While a tile is held, follow the pointer and slot it between the others.
  useEffect(() => {
    if (!dragKey) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      setPt({ x: e.clientX, y: e.clientY });
      const others = orderRef.current.filter(k => k !== dragKey);
      let best = others.length, bestDist = Infinity, before = false;
      others.forEach((k, i) => {
        const el = containerRef.current?.querySelector(`[data-sk="${k}"]`) as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
        if (d < bestDist) { bestDist = d; best = i; before = e.clientY < cy - 2 || (Math.abs(e.clientY - cy) < r.height / 2 && e.clientX < cx); }
      });
      const pos = before ? best : best + 1;
      const next = [...others.slice(0, pos), dragKey, ...others.slice(pos)];
      setOrder(prev => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
    };
    const up = () => { saveOrder(storageKey, orderRef.current); setDragKey(null); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragKey]);

  function onDown(key: string, e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    grab.current = { ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width };
    start.current = { x: e.clientX, y: e.clientY };
    setPt({ x: e.clientX, y: e.clientY });
    if (edit) { setDragKey(key); return; }
    pressTimer.current = setTimeout(() => { setEdit(true); setDragKey(key); }, 380);
  }
  function onMovePre(e: React.PointerEvent) {
    if (pressTimer.current && start.current &&
      (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8)) {
      clearTimeout(pressTimer.current); pressTimer.current = null;
    }
  }
  const clearPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };

  return (
    <div>
      {edit && (
        <div className="flex items-center justify-between mb-2 px-1 animate-fadeIn">
          <span className="text-xs text-muted flex items-center gap-1.5"><GripVertical size={13} /> Drag to rearrange</span>
          <button onClick={() => setEdit(false)} className="text-sm font-bold accent-text press">Done</button>
        </div>
      )}
      <div ref={containerRef} className={className}>
        {order.map(key => (
          <div key={key} data-sk={key}
            onPointerDown={e => onDown(key, e)}
            onPointerMove={onMovePre}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onContextMenu={e => { if (edit) e.preventDefault(); }}
            onClickCapture={e => { if (edit && !(e.target as HTMLElement).closest('[data-no-drag]')) { e.preventDefault(); e.stopPropagation(); } }}
            className={`relative ${edit ? 'select-none' : ''} ${edit && key !== dragKey ? 'animate-wiggle' : ''} ${key === dragKey ? 'opacity-0' : ''}`}
            style={{ touchAction: edit ? 'none' : undefined }}>
            {byKey.get(key)}
            {badge?.(key, edit)}
          </div>
        ))}
      </div>
      {hint && !edit && <p className="text-center text-[11px] text-muted/70 mt-2.5">Press and hold to rearrange</p>}

      {dragKey && grab.current && (
        <Overlay>
          <div style={{ position: 'fixed', left: pt.x - grab.current.ox, top: pt.y - grab.current.oy, width: grab.current.w, zIndex: 220, pointerEvents: 'none' }}
            className="rotate-[1.5deg] scale-[1.03] drop-shadow-2xl select-none">
            {byKey.get(dragKey)}
          </div>
        </Overlay>
      )}
    </div>
  );
}

function loadOrder(storageKey: string, all: string[]): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved)) {
      const kept = saved.filter((k: string) => all.includes(k));
      return [...kept, ...all.filter(k => !kept.includes(k))];
    }
  } catch { /* ignore */ }
  return all;
}
function saveOrder(storageKey: string, order: string[]) {
  try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* ignore */ }
}
