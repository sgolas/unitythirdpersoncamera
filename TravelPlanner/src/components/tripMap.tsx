/**
 * Shared "string map" — used by the app's Map tab and the web portal.
 * Builds an ordered list of stops from the trip's places and draws them as
 * numbered pins connected by a dashed route.
 */
import type { Transport, Accommodation, ItineraryEvent } from '../types';
import { fmtDate } from '../utils/format';

export interface Stop { label: string; date: string; emoji: string; kind: string }

export function computeStops(
  transport: Transport[], stays: Accommodation[], itinerary: ItineraryEvent[],
): Stop[] {
  const raw: Stop[] = [];
  stays.forEach(s => raw.push({ label: s.city || s.name, date: s.checkIn, emoji: '🏨', kind: 'stay' }));
  transport.forEach(t => raw.push({
    label: t.toPlace, date: t.departDate,
    emoji: t.mode === 'flight' ? '✈️' : t.mode === 'train' ? '🚆' : t.mode === 'ferry' ? '⛴️' : '🚗',
    kind: 'transport',
  }));
  itinerary.forEach(e => { if (e.place) raw.push({ label: e.place, date: e.date, emoji: '📍', kind: 'event' }); });

  const sorted = raw.filter(s => s.label).sort((a, b) => a.date.localeCompare(b.date));
  const stops: Stop[] = [];
  for (const s of sorted) {
    const prev = stops[stops.length - 1];
    if (!prev || prev.label.toLowerCase() !== s.label.toLowerCase()) stops.push(s);
  }
  return stops;
}

const PIN_COLORS = ['#0ea5a3', '#fb7185', '#f59e0b', '#a78bfa', '#38bdf8', '#34d399'];

export function StringMap({ stops }: { stops: Stop[] }) {
  const W = 360;
  const TOP = 70;
  const GAP = 118;
  const H = TOP + stops.length * GAP + 40;

  const pos = stops.map((_, i) => ({ x: i % 2 === 0 ? 96 : W - 96, y: TOP + i * GAP }));

  let d = '';
  pos.forEach((p, i) => {
    if (i === 0) { d += `M ${p.x} ${p.y}`; return; }
    const prev = pos[i - 1];
    const midY = (prev.y + p.y) / 2;
    d += ` C ${prev.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`;
  });

  return (
    <div className="px-3 py-4">
      <div className="rounded-3xl overflow-hidden shadow-sm border border-amber-200"
        style={{ background: 'radial-gradient(circle at 20% 10%, #fffdf5, #fdf6e3)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
          <defs>
            <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#00000008" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#dots)" />

          <g transform={`translate(${W - 44} 34)`} opacity="0.5">
            <circle r="18" fill="none" stroke="#0f766e" strokeWidth="1.5" />
            <path d="M0 -16 L4 0 L0 16 L-4 0 Z" fill="#fb7185" />
            <path d="M-16 0 L0 -4 L16 0 L0 4 Z" fill="#0f766e" />
            <text y="-20" textAnchor="middle" fontSize="8" fill="#0f766e" fontWeight="700">N</text>
          </g>

          <path d={d} fill="none" stroke="#0f766e" strokeWidth="3"
            strokeLinecap="round" strokeDasharray="2 9" opacity="0.7" />

          {pos.map((p, i) => {
            const color = PIN_COLORS[i % PIN_COLORS.length];
            const s = stops[i];
            const labelLeft = p.x > W / 2;
            return (
              <g key={i}>
                <ellipse cx={p.x} cy={p.y + 20} rx="10" ry="3" fill="#00000012" />
                <circle cx={p.x} cy={p.y} r="17" fill={color} />
                <circle cx={p.x} cy={p.y} r="17" fill="none" stroke="#ffffff" strokeWidth="3" />
                <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="15">{s.emoji}</text>
                <circle cx={p.x + 13} cy={p.y - 13} r="8" fill="#0f172a" />
                <text x={p.x + 13} y={p.y - 10} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">{i + 1}</text>
                <g transform={`translate(${labelLeft ? p.x - 30 - 128 : p.x + 30} ${p.y - 16})`}>
                  <rect width="128" height="34" rx="9" fill="#ffffff" stroke={color} strokeWidth="1.5" />
                  <text x="9" y="15" fontSize="11" fontWeight="700" fill="#0f172a">
                    {s.label.length > 16 ? s.label.slice(0, 15) + '…' : s.label}
                  </text>
                  <text x="9" y="27" fontSize="8.5" fill="#64748b">{fmtDate(s.date)}</text>
                </g>
              </g>
            );
          })}

          <text x={pos[0].x} y={pos[0].y - 26} textAnchor="middle" fontSize="12">🏁</text>
          <text x={pos[pos.length - 1].x} y={pos[pos.length - 1].y + 34} textAnchor="middle" fontSize="12">🎯</text>
        </svg>
      </div>
      <p className="text-center text-xs text-slate-400 mt-3">
        {stops.length} stop{stops.length === 1 ? '' : 's'} · in date order
      </p>
    </div>
  );
}
