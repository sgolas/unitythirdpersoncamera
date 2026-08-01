import { useState, useRef, useEffect } from 'react';
import {
  Plane, BedDouble, CalendarRange, PiggyBank,
  Sparkles, History, Compass, CalendarClock, Calculator, ChevronRight,
  MessageCircle, GripVertical,
} from 'lucide-react';
import {
  useTrip, useSpend, useTransport, useAccommodation,
  useItinerary, useTravelers, useBudgetSheets,
} from '../../hooks/useTrip';
import { money, moneyHome, sumExpenses, countsToBudget } from '../../types';
import type { Transport, Accommodation, ExpenseCategory } from '../../types';
import { daysUntil, fmtDate, fmtStamp, fmtTime, todayStr, tripLength } from '../../utils/format';
import { getLastSync } from '../../lib/config';
import { computeStops } from '../tripMap';
import { WeatherWidget } from '../WeatherWidget';
import { Overlay } from '../ui';
import { sectionByKey } from '../../lib/sections';
import { useShortcuts } from '../../lib/dashShortcuts';
import { useUnreadChat } from '../../lib/chatUnread';

const AV_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#fb7185', '#6366f1'];
const CAT_META: Record<ExpenseCategory, { label: string; color: string }> = {
  food:       { label: 'Food',       color: '#fb7185' },
  transport:  { label: 'Transport',  color: '#38bdf8' },
  lodging:    { label: 'Lodging',    color: '#a78bfa' },
  activities: { label: 'Activities', color: '#34d399' },
  shopping:   { label: 'Shopping',   color: '#f59e0b' },
  other:      { label: 'Other',      color: '#64748b' },
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function DashboardTab({ onNavigate }: { onNavigate: (v: any) => void }) {
  const pinned = useShortcuts();
  const unreadChat = useUnreadChat();
  const trip = useTrip();
  const expenses = useSpend();
  const sheets = useBudgetSheets();
  const transport = useTransport();
  const stays = useAccommodation();
  const itinerary = useItinerary();
  const travelers = useTravelers();

  if (!trip) return null;

  const cur = trip.tripCurrency;
  const today = todayStr();
  const days = daysUntil(trip.startDate);
  const counted = expenses.filter(countsToBudget);
  const spent = sumExpenses(counted, cur);
  const grandBudget = trip.totalBudget + sheets.reduce((s, x) => s + x.total, 0);
  const budgetPct = grandBudget > 0 ? Math.min(100, Math.round((spent / grandBudget) * 100)) : 0;
  const lastSync = getLastSync();

  const stops = computeStops(transport, stays, itinerary);
  const weatherLoc = stops[0]?.label || trip.destinations.split(/[·,]/)[0].trim();

  const flights = transport.filter(t => t.mode === 'flight');
  const nextFlight = flights.find(f => f.departDate >= today) ?? flights[0];
  const nextStay = stays.find(s => s.checkOut >= today) ?? stays[0];

  const countdownLabel = days > 0 ? `${days}` : days === 0 ? '0' : daysUntil(trip.endDate) >= 0 ? '•' : '✓';
  const countdownSub = days > 0 ? 'days to go' : days === 0 ? 'starts today' : daysUntil(trip.endDate) >= 0 ? 'on your trip' : 'trip complete';

  // Top spend categories (for the budget card).
  const catSums = (Object.keys(CAT_META) as ExpenseCategory[])
    .map(k => ({ k, ...CAT_META[k], sum: sumExpenses(counted.filter(e => e.category === k), cur) }))
    .filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum);
  const maxCat = catSums[0]?.sum || 1;

  // Upcoming: flights, stay check-ins and itinerary events merged by date.
  type U = { id: string; date: string; time: string; title: string; sub?: string; kind: 'transport' | 'stay' | 'itin'; cost?: number; costCur?: string };
  const upAll: U[] = [
    ...transport.map(t => ({ id: 't' + t.id, date: t.departDate, time: t.departTime || '', title: `${cap(t.mode)}${t.toPlace ? ` → ${t.toPlace}` : ''}`, sub: t.fromPlace, kind: 'transport' as const, cost: t.cost, costCur: t.costCurrency })),
    ...stays.map(s => ({ id: 's' + s.id, date: s.checkIn, time: '', title: `Check in · ${s.name}`, sub: s.city, kind: 'stay' as const })),
    ...itinerary.map(e => ({ id: 'i' + e.id, date: e.date, time: e.startTime || '', title: e.title, sub: e.place, kind: 'itin' as const, cost: e.cost, costCur: e.costCurrency })),
  ].filter(x => x.date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const future = upAll.filter(x => x.date >= today);
  const upcoming = (future.length ? future : upAll).slice(0, 4);

  return (
    <div className="animate-fadeUp px-3 sm:px-4 pb-5 space-y-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>

      {/* Slim header */}
      <header className="relative overflow-hidden rounded-2xl text-white px-4 py-3 shadow-soft"
        style={{ background: 'linear-gradient(100deg, var(--hero-1), var(--hero-2) 65%, var(--hero-3))' }}>
        <div className="absolute -right-8 -top-12 w-36 h-36 rounded-full opacity-20 blur-2xl accent-gradient pointer-events-none" />
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-baseline gap-2.5 flex-wrap min-w-0 pr-24 sm:pr-0">
            <h1 className="text-lg font-bold leading-tight">{trip.name}</h1>
            <span className="text-white/60 text-xs flex items-center gap-1.5 flex-wrap">
              <span className="text-white/85 font-semibold">{fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}</span>
              {trip.destinations && <><span className="w-1 h-1 rounded-full bg-white/30" /><span className="truncate">{trip.destinations}</span></>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {travelers.length > 0 && (
              <div className="flex" aria-label="Travellers">
                {travelers.slice(0, 5).map((t, i) => (
                  <span key={t.id} className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white overflow-hidden"
                    style={{ marginLeft: i ? -7 : 0, border: '2px solid var(--hero-2)', background: t.photo ? undefined : AV_COLORS[i % AV_COLORS.length] }}>
                    {t.photo ? <img src={t.photo} alt="" className="w-full h-full object-cover" /> : (t.emoji || t.name.charAt(0))}
                  </span>
                ))}
              </div>
            )}
            <span className="text-white/70 text-xs whitespace-nowrap flex items-center gap-1">
              <CalendarClock size={12} className="opacity-70" />
              <b className="text-white font-extrabold text-sm">{countdownLabel}</b> {countdownSub}
            </span>
          </div>
        </div>
      </header>

      {/* Unread family chat */}
      {unreadChat > 0 && (
        <button onClick={() => onNavigate('chat')}
          className="w-full flex items-center gap-3 bg-rose-500 text-white rounded-2xl px-4 py-2.5 shadow-lg press">
          <span className="relative flex-shrink-0">
            <MessageCircle size={20} />
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-rose-500 text-[11px] font-extrabold flex items-center justify-center">!</span>
          </span>
          <span className="flex-1 text-left font-bold text-sm">
            {unreadChat === 1 ? 'New message in family chat' : `${unreadChat} new messages in family chat`}
          </span>
          <span className="text-white/80 text-xs font-semibold">Open ›</span>
        </button>
      )}

      {/* Pinned shortcuts (long-press items in More to pin) */}
      {pinned.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
          {pinned.map(key => {
            const s = sectionByKey(key);
            if (!s) return null;
            return (
              <button key={key} onClick={() => onNavigate(key)}
                className="flex-shrink-0 flex items-center gap-2 bg-surface border border-line rounded-full pl-1.5 pr-3.5 py-1.5 shadow-soft press">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                  style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` }}>{s.icon}</span>
                <span className="text-xs font-semibold text-content">{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Reorderable widget boxes — press and hold a card to rearrange */}
      <Reorderable items={[
        { key: 'flight', node: (
          <Card title="Next flight" icon={<Plane size={13} />} action="All transport" onAction={() => onNavigate('transport')}>
            <FlightBody flight={nextFlight} />
          </Card>
        ) },
        { key: 'stay', node: (
          <Card title="Next stay" icon={<BedDouble size={13} />} action="All stays" onAction={() => onNavigate('accommodation')}>
            <StayBody stay={nextStay} />
          </Card>
        ) },
        { key: 'budget', node: (
          <Card title="Budget" icon={<PiggyBank size={13} />} action="Breakdown" onAction={() => onNavigate('budget')}>
            <div className="flex items-center gap-4">
              <Ring pct={budgetPct} />
              <div className="flex-1 min-w-0 space-y-2">
                {catSums.length === 0 ? (
                  <p className="text-sm text-muted">No spending yet.</p>
                ) : catSums.slice(0, 3).map(c => (
                  <div key={c.k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted">{c.label}</span>
                      <span className="font-bold text-content">{moneyHome(c.sum, cur)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round((c.sum / maxCat) * 100)}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) },
        { key: 'upcoming', node: (
          <Card title="Upcoming" icon={<CalendarRange size={13} />} action="Full itinerary" onAction={() => onNavigate('itinerary')}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled yet — add flights, stays or activities.</p>
            ) : (
              <div className="flex flex-col">
                {upcoming.map((x, i) => {
                  const d = new Date(x.date + 'T00:00:00');
                  const ic = x.kind === 'transport' ? <Plane size={15} /> : x.kind === 'stay' ? <BedDouble size={15} /> : <CalendarRange size={15} />;
                  const col = x.kind === 'transport' ? '#38bdf8' : x.kind === 'stay' ? '#a78bfa' : '#34d399';
                  return (
                    <button key={x.id} onClick={() => onNavigate(x.kind === 'transport' ? 'transport' : x.kind === 'stay' ? 'accommodation' : 'itinerary')}
                      className={`flex items-center gap-3 py-2.5 text-left press ${i ? 'border-t border-line' : ''}`}>
                      <div className="w-10 text-center flex-shrink-0">
                        <p className="text-base font-extrabold leading-none text-content tabular-nums">{d.getDate()}</p>
                        <p className="text-[10px] uppercase tracking-wide text-muted">{d.toLocaleDateString(undefined, { month: 'short' })}</p>
                      </div>
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: col }}>{ic}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-content truncate">{x.title}</p>
                        {(x.sub || x.time) && <p className="text-xs text-muted truncate">{[x.time ? fmtTime(x.time) : '', x.sub].filter(Boolean).join(' · ')}</p>}
                      </div>
                      {x.cost ? <span className="text-sm font-bold text-amber-500 whitespace-nowrap">{money(x.cost, x.costCur ?? cur)}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        ) },
        { key: 'weather', node: <WeatherWidget location={weatherLoc} /> },
      ]} />

      <div className="grid grid-cols-3 gap-3">
        <QuickLink onClick={() => onNavigate('overview')} icon={<Compass size={18} />} label="Overview" />
        <QuickLink onClick={() => onNavigate('converter')} icon={<Calculator size={18} />} label="Currency" />
        <QuickLink onClick={() => onNavigate('helper')} icon={<Sparkles size={18} />} label="Helper" />
      </div>

      <button onClick={() => onNavigate('changelog')}
        className="w-full flex items-center justify-center gap-2 text-muted text-xs py-1 press">
        <History size={13} /> {lastSync ? `Last synced ${fmtStamp(lastSync)}` : 'Syncs automatically when online'}
      </button>
    </div>
  );
}

const ORDER_KEY = 'dash.widgetOrder';

/**
 * Home-screen style reorderable boxes: press and hold a card to enter edit mode
 * (the cards wiggle), then drag it to a new spot. The order is saved per device.
 */
function Reorderable({ items }: { items: { key: string; node: React.ReactNode }[] }) {
  const all = items.map(i => i.key);
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
      if (Array.isArray(saved)) {
        const kept = saved.filter((k: string) => all.includes(k));
        return [...kept, ...all.filter(k => !kept.includes(k))];
      }
    } catch { /* ignore */ }
    return all;
  });
  const [edit, setEdit] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [pt, setPt] = useState({ x: 0, y: 0 });
  const grab = useRef<{ ox: number; oy: number; w: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order); orderRef.current = order;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const byKey = new Map(items.map(i => [i.key, i.node]));

  // Keep the saved order in step if the set of widgets ever changes.
  useEffect(() => {
    setOrder(o => {
      const next = [...o.filter(k => all.includes(k)), ...all.filter(k => !o.includes(k))];
      return next.length === o.length && next.every((k, i) => k === o[i]) ? o : next;
    });
  }, [all.join('|')]);

  // While a card is held, follow the pointer and slot it between the others.
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
        if (d < bestDist) { bestDist = d; best = i; before = e.clientY < cy; }
      });
      const pos = before ? best : best + 1;
      const next = [...others.slice(0, pos), dragKey, ...others.slice(pos)];
      setOrder(prev => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
    };
    const up = () => {
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(orderRef.current)); } catch { /* ignore */ }
      setDragKey(null);
    };
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
          <span className="text-xs text-muted flex items-center gap-1.5"><GripVertical size={13} /> Drag the cards to rearrange</span>
          <button onClick={() => setEdit(false)} className="text-sm font-bold accent-text press">Done</button>
        </div>
      )}
      <div ref={containerRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {order.map(key => (
          <div key={key} data-sk={key}
            onPointerDown={e => onDown(key, e)}
            onPointerMove={onMovePre}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onContextMenu={e => { if (edit) e.preventDefault(); }}
            onClickCapture={e => { if (edit) { e.preventDefault(); e.stopPropagation(); } }}
            className={`${edit ? 'select-none cursor-grab' : ''} ${edit && key !== dragKey ? 'animate-wiggle' : ''} ${key === dragKey ? 'opacity-0' : ''}`}
            style={{ touchAction: edit ? 'none' : undefined }}>
            {byKey.get(key)}
          </div>
        ))}
      </div>
      {!edit && <p className="text-center text-[11px] text-muted/70 mt-2.5">Press and hold a card to rearrange</p>}

      {dragKey && grab.current && (
        <Overlay>
          <div style={{ position: 'fixed', left: pt.x - grab.current.ox, top: pt.y - grab.current.oy, width: grab.current.w, zIndex: 120, pointerEvents: 'none' }}
            className="rotate-[1.5deg] scale-[1.03] drop-shadow-2xl select-none">
            {byKey.get(dragKey)}
          </div>
        </Overlay>
      )}
    </div>
  );
}

/** A titled dashboard card with an optional "view all" action. */
function Card({ title, icon, action, onAction, children }: {
  title: string; icon: React.ReactNode; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-soft border border-line overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="flex items-center gap-1.5 text-muted text-xs font-bold uppercase tracking-wide">{icon} {title}</span>
        {action && onAction && (
          <button onClick={onAction} className="text-xs font-bold accent-text press flex items-center gap-0.5">
            {action} <ChevronRight size={13} />
          </button>
        )}
      </div>
      <div className="px-4 pt-2 pb-4">{children}</div>
    </div>
  );
}

function FlightBody({ flight }: { flight?: Transport }) {
  if (!flight) return <p className="text-sm text-muted">No flights yet — tap to add ✈️</p>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-content truncate">{flight.fromPlace || '—'}</p>
        <p className="text-xs text-muted">{fmtDate(flight.departDate)}{flight.departTime ? ` · ${fmtTime(flight.departTime)}` : ''}</p>
      </div>
      <div className="flex flex-col items-center flex-shrink-0">
        <Plane size={15} className="text-accent -rotate-45" />
        <div className="w-10 border-t border-dashed border-line mt-0.5" />
      </div>
      <div className="flex-1 min-w-0 text-right">
        <p className="font-bold text-content truncate">{flight.toPlace || '—'}</p>
        <p className="text-xs text-muted truncate">{flight.confirmation ? `🎫 ${flight.confirmation}` : ''}</p>
      </div>
    </div>
  );
}

function StayBody({ stay }: { stay?: Accommodation }) {
  if (!stay) return <p className="text-sm text-muted">No stays yet — tap to add 🏨</p>;
  const nights = tripLength(stay.checkIn, stay.checkOut);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="font-bold text-content truncate">{stay.name}{stay.city ? ` · ${stay.city}` : ''}</p>
        <p className="text-xs text-muted">{fmtDate(stay.checkIn)} → {fmtDate(stay.checkOut)}</p>
      </div>
      <span className="text-xs font-bold text-grape bg-grape/10 px-2.5 py-1 rounded-full flex-shrink-0">{nights}n</span>
    </div>
  );
}

function QuickLink({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="bg-surface rounded-2xl py-3 shadow-soft border border-line flex flex-col items-center gap-1 press">
      <span className="text-accent">{icon}</span>
      <span className="text-xs font-semibold text-content">{label}</span>
    </button>
  );
}

/** Small circular progress ring. */
function Ring({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const over = pct >= 100;
  return (
    <div className="relative flex-shrink-0">
      <svg width="66" height="66" viewBox="0 0 66 66" className="-rotate-90">
        <circle cx="33" cy="33" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle cx="33" cy="33" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={over ? '#fb7185' : 'var(--accent)'}
          strokeDasharray={c} strokeDashoffset={c - (Math.min(pct, 100) / 100) * c}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-extrabold text-content tabular-nums" style={{ fontSize: '0.95rem' }}>{pct}%</span>
    </div>
  );
}
