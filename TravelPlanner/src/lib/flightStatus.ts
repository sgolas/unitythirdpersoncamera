/**
 * Live flight status for upcoming flights (departing within the next 48h or
 * the last 6h). Looked up through our own /api/flightstatus relay, cached for
 * 10 minutes, and if the status changes meaningfully (delay, gate, cancel)
 * a local notification fires so the family sees it.
 */
import type { Transport } from '../types';
import { isNative } from './platform';
import { notifyNow } from './notify';

const NATIVE_BASE = 'https://trip-planner-sgolas.pages.dev';
const ENDPOINT = isNative ? `${NATIVE_BASE}/api/flightstatus` : '/api/flightstatus';
const LOOKUP_ENDPOINT = isNative ? `${NATIVE_BASE}/api/flightlookup` : '/api/flightlookup';
const CACHE_KEY = 'flight.status.v1';
const TTL = 10 * 60_000;

export interface FlightStatus {
  iata: string; date: string; status: string;
  depGate: string | null; depTerminal: string | null; delayMin: number | null;
  depScheduled: string | null; depEstimated: string | null;
  arrScheduled: string | null; arrEstimated: string | null;
}

interface Cache { at: number; configured: boolean; statuses: Record<string, FlightStatus> }

function loadCache(): Cache {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '') as Cache; }
  catch { return { at: 0, configured: true, statuses: {} }; }
}
function saveCache(c: Cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* full */ } }

/** Flights worth watching: valid flight number, departing −6h … +48h. */
export function watchableFlights(transport: Transport[]): Transport[] {
  const now = Date.now();
  return transport.filter(t => {
    if (t.mode !== 'flight' || !t.flightNumber || !t.departDate) return false;
    const dep = new Date(`${t.departDate}T${t.departTime || '00:00'}:00`).getTime();
    return dep > now - 6 * 3600_000 && dep < now + 48 * 3600_000;
  });
}

export const statusKey = (t: Transport) =>
  `${(t.flightNumber ?? '').replace(/\s+/g, '').toUpperCase()}:${t.departDate}`;

/** True once the server has a flight-data key configured. */
export function statusConfigured(): boolean { return loadCache().configured; }

/**
 * Get statuses for the given flights (cache-first). Returns a map keyed by
 * statusKey(t). Fires a notification when something changed vs. last check.
 */
export async function getFlightStatuses(flights: Transport[], force = false): Promise<Record<string, FlightStatus>> {
  const cache = loadCache();
  if (flights.length === 0) return {};
  if (!force && Date.now() - cache.at < TTL) return cache.statuses;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flights: flights.map(t => ({ iata: t.flightNumber, date: t.departDate })) }),
    });
    if (res.status === 503) { saveCache({ ...cache, at: Date.now(), configured: false }); return cache.statuses; }
    if (!res.ok) return cache.statuses;
    const { statuses } = await res.json() as { statuses: (FlightStatus | null)[] };

    const next: Record<string, FlightStatus> = { ...cache.statuses };
    flights.forEach((t, i) => {
      const s = statuses[i];
      if (!s) return;
      const key = statusKey(t);
      const prev = next[key];
      next[key] = s;
      // Alert on meaningful changes (only after we had a baseline).
      if (prev) {
        if (s.status === 'cancelled' && prev.status !== 'cancelled') {
          notifyNow('⚠️ Flight cancelled', `${s.iata} ${t.fromPlace} → ${t.toPlace} shows as cancelled — check with the airline.`);
        } else if ((s.delayMin ?? 0) >= 15 && (s.delayMin ?? 0) !== (prev.delayMin ?? 0)) {
          notifyNow('🕐 Flight delayed', `${s.iata} is now ~${s.delayMin} min late${s.depGate ? ` · Gate ${s.depGate}` : ''}.`);
        } else if (s.depGate && s.depGate !== prev.depGate) {
          notifyNow('🚪 Gate change', `${s.iata} now departs from gate ${s.depGate}${s.depTerminal ? ` (terminal ${s.depTerminal})` : ''}.`);
        }
      }
    });
    saveCache({ at: Date.now(), configured: true, statuses: next });
    return next;
  } catch { return cache.statuses; }
}

/* ── Flight lookup (auto-fill the transport form) ───────────── */
export interface FlightInfo {
  airline: string | null;
  from: { name: string | null; iata: string | null };
  to: { name: string | null; iata: string | null };
  depTime: string | null;  // 'HH:MM' local at departure airport
  arrTime: string | null;  // 'HH:MM' local at arrival airport
  dayOffset: number;       // arrival is this many days after departure
}

/** Resolve a flight number into its schedule. 'not-configured' when no key. */
export async function lookupFlight(iata: string): Promise<FlightInfo | 'not-configured' | null> {
  try {
    const r = await fetch(LOOKUP_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iata }),
    });
    if (r.status === 503) return 'not-configured';
    if (!r.ok) return null;
    const d = await r.json() as { info?: FlightInfo | null };
    return d.info ?? null;
  } catch { return null; }
}

/** Short human label, e.g. "On time · Gate B12", "Delayed 45 min", "Landed". */
export function statusLabel(s: FlightStatus): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  const gate = s.depGate ? ` · Gate ${s.depGate}` : '';
  if (s.status === 'cancelled') return { text: 'Cancelled', tone: 'bad' };
  if (s.status === 'landed') return { text: 'Landed', tone: 'ok' };
  if (s.status === 'active') return { text: `In the air${gate}`, tone: 'ok' };
  if ((s.delayMin ?? 0) >= 15) return { text: `Delayed ~${s.delayMin} min${gate}`, tone: 'warn' };
  if (s.status === 'scheduled') return { text: `On time${gate}`, tone: 'ok' };
  return { text: s.status.charAt(0).toUpperCase() + s.status.slice(1) + gate, tone: 'ok' };
}
