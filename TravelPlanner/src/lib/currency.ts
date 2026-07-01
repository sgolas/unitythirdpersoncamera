/**
 * Home / away currency preference + live exchange rates.
 *
 * The app always displays money in TWO currencies: the traveller's home
 * currency (Canadian dollar) and the "away" currency they're spending in
 * (Euro or Polish złoty). Amounts are stored in the away currency; every
 * money string shows both the away value and its home-currency equivalent.
 *
 * Rates come from the free, key-less exchangerate API and are cached for a
 * day. A baked-in fallback guarantees both values render on the very first
 * launch (and offline), before any network response arrives.
 */

export interface CurOption { code: string; label: string; sym: string; }

// Only Canada is offered as home; only Euro / Złoty as away (per spec).
export const HOME_OPTIONS: CurOption[] = [
  { code: 'CAD', label: 'Canada', sym: 'CA$' },
];
export const AWAY_OPTIONS: CurOption[] = [
  { code: 'EUR', label: 'Euro', sym: '€' },
  { code: 'PLN', label: 'Polish złoty', sym: 'zł' },
];

const HOME_KEY = 'cur.home';
const AWAY_KEY = 'cur.away';
const RATES_KEY = 'cur.rates';
const DAY = 86_400_000;

export function getHomeCurrency(): string { return localStorage.getItem(HOME_KEY) || 'CAD'; }
export function getAwayCurrency(): string { return localStorage.getItem(AWAY_KEY) || 'EUR'; }
export function setHomeCurrency(c: string) { localStorage.setItem(HOME_KEY, c); emitChange(); }
export function setAwayCurrency(c: string) { localStorage.setItem(AWAY_KEY, c); emitChange(); }

/** Approximate rates as units per 1 USD — overwritten by the live fetch. */
const BAKED: Record<string, number> = { USD: 1, EUR: 0.92, PLN: 3.98, CAD: 1.37, GBP: 0.79, CHF: 0.88, JPY: 157, AUD: 1.52 };

let rates: Record<string, number> = loadCachedRates() ?? BAKED;

function loadCachedRates(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > DAY * 4) return null; // very stale → fall back to baked
    return data;
  } catch { return null; }
}

/** Convert an amount between currencies using the USD-based rate table. */
export function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const rf = rates[from], rt = rates[to];
  if (!rf || !rt) return amount; // unknown currency → show as-is rather than break
  return (amount / rf) * rt;
}

/** Fetch fresh rates once per day; refresh the display when they land. */
export async function initCurrency(): Promise<void> {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (raw) { const { at } = JSON.parse(raw); if (Date.now() - at < DAY) return; }
  } catch { /* ignore */ }
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD').then(res => res.json());
    if (r?.result === 'success' && r.rates) {
      rates = { ...BAKED, ...r.rates };
      localStorage.setItem(RATES_KEY, JSON.stringify({ at: Date.now(), data: rates }));
      emitChange();
    }
  } catch { /* offline — baked / cached rates stay in effect */ }
}

/** Notify the app to re-render money after a rate refresh or setting change. */
function emitChange() {
  try { window.dispatchEvent(new Event('cur-change')); } catch { /* SSR/no-window */ }
}
