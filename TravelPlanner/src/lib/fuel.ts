/**
 * Fuel & driving-cost helpers — unit conversions, a built-in country
 * average-price table (the reliable, offline fallback), and a best-effort
 * "live" price lookup for the few places that publish free, keyless data.
 *
 * All maths is done in canonical metric: distance in km, economy in litres per
 * 100 km, price per litre in the price's own currency. The UI converts to/from
 * whatever units and currency the user prefers at the edges.
 */
import type { EconomyUnit, FuelType } from '../types';

/* ── Economy units ─────────────────────────────────────────────── */
export const ECONOMY_UNITS: { key: EconomyUnit; label: string; hint: string }[] = [
  { key: 'l100',  label: 'L/100 km',  hint: 'litres per 100 km' },
  { key: 'kml',   label: 'km/L',      hint: 'kilometres per litre' },
  { key: 'mpgus', label: 'MPG (US)',  hint: 'US miles per gallon' },
  { key: 'mpguk', label: 'MPG (UK)',  hint: 'UK miles per gallon' },
];

/** Convert a fuel-economy figure to canonical litres/100 km. */
export function toL100(value: number, unit: EconomyUnit): number {
  if (!(value > 0)) return 0;
  switch (unit) {
    case 'l100':  return value;
    case 'kml':   return 100 / value;
    case 'mpgus': return 235.214583 / value;
    case 'mpguk': return 282.480936 / value;
  }
}

/** A sensible starting economy value shown for a fresh vehicle, per unit. */
export function defaultEconomyFor(unit: EconomyUnit): number {
  switch (unit) {
    case 'l100':  return 7.5;
    case 'kml':   return 13.3;
    case 'mpgus': return 31;
    case 'mpguk': return 38;
  }
}

/* ── Price volume units ────────────────────────────────────────── */
export type PriceUnit = 'liter' | 'usgal' | 'ukgal';
export const PRICE_UNITS: { key: PriceUnit; label: string; per: string }[] = [
  { key: 'liter', label: 'per litre',      per: 'L' },
  { key: 'usgal', label: 'per US gallon',  per: 'US gal' },
  { key: 'ukgal', label: 'per UK gallon',  per: 'UK gal' },
];
const LITRES_PER: Record<PriceUnit, number> = { liter: 1, usgal: 3.785411784, ukgal: 4.54609 };
export const perLitreFrom = (value: number, unit: PriceUnit) => value / LITRES_PER[unit];
export const perUnitFrom  = (perLitre: number, unit: PriceUnit) => perLitre * LITRES_PER[unit];

/* ── Cost maths ────────────────────────────────────────────────── */
export const litresUsed = (distanceKm: number, l100: number) => (distanceKm / 100) * l100;
export const fuelCost = (distanceKm: number, l100: number, pricePerLitre: number) =>
  litresUsed(distanceKm, l100) * pricePerLitre;

export const FUEL_TYPES: { key: FuelType; label: string; emoji: string }[] = [
  { key: 'petrol', label: 'Petrol', emoji: '⛽' },
  { key: 'diesel', label: 'Diesel', emoji: '🛢️' },
  { key: 'lpg',    label: 'LPG',    emoji: '🔵' },
];

/* ── Country average prices (per litre, local currency) ─────────────
 * Recent-ish typical pump prices — a reliable starting estimate the user can
 * override to today's exact price. Not live; edit for accuracy.               */
interface CountryFuel { currency: string; petrol: number; diesel: number; lpg: number }
const PRICES: Record<string, CountryFuel> = {
  US: { currency: 'USD', petrol: 0.95, diesel: 1.06, lpg: 0.75 },
  CA: { currency: 'CAD', petrol: 1.55, diesel: 1.75, lpg: 0.95 },
  MX: { currency: 'MXN', petrol: 23.5, diesel: 24.5, lpg: 12 },
  GB: { currency: 'GBP', petrol: 1.45, diesel: 1.52, lpg: 0.85 },
  IE: { currency: 'EUR', petrol: 1.75, diesel: 1.70, lpg: 0.95 },
  FR: { currency: 'EUR', petrol: 1.85, diesel: 1.75, lpg: 0.95 },
  DE: { currency: 'EUR', petrol: 1.80, diesel: 1.70, lpg: 1.05 },
  ES: { currency: 'EUR', petrol: 1.55, diesel: 1.45, lpg: 0.90 },
  IT: { currency: 'EUR', petrol: 1.85, diesel: 1.75, lpg: 0.72 },
  PT: { currency: 'EUR', petrol: 1.75, diesel: 1.60, lpg: 0.85 },
  NL: { currency: 'EUR', petrol: 2.05, diesel: 1.75, lpg: 1.00 },
  BE: { currency: 'EUR', petrol: 1.75, diesel: 1.75, lpg: 0.90 },
  CH: { currency: 'CHF', petrol: 1.80, diesel: 1.90, lpg: 1.00 },
  AT: { currency: 'EUR', petrol: 1.55, diesel: 1.55, lpg: 0.95 },
  DK: { currency: 'DKK', petrol: 14.5, diesel: 13.5, lpg: 8 },
  SE: { currency: 'SEK', petrol: 18.5, diesel: 20,   lpg: 11 },
  NO: { currency: 'NOK', petrol: 22,   diesel: 21,   lpg: 12 },
  FI: { currency: 'EUR', petrol: 1.85, diesel: 1.80, lpg: 1.00 },
  PL: { currency: 'PLN', petrol: 6.40, diesel: 6.60, lpg: 2.90 },
  CZ: { currency: 'CZK', petrol: 38,   diesel: 38,   lpg: 18 },
  GR: { currency: 'EUR', petrol: 1.85, diesel: 1.70, lpg: 0.95 },
  HR: { currency: 'EUR', petrol: 1.50, diesel: 1.45, lpg: 0.85 },
  HU: { currency: 'HUF', petrol: 610,  diesel: 620,  lpg: 350 },
  RO: { currency: 'RON', petrol: 7.3,  diesel: 7.5,  lpg: 3.6 },
  TR: { currency: 'TRY', petrol: 43,   diesel: 43,   lpg: 22 },
  AU: { currency: 'AUD', petrol: 1.90, diesel: 1.95, lpg: 1.05 },
  NZ: { currency: 'NZD', petrol: 2.75, diesel: 2.00, lpg: 1.40 },
  JP: { currency: 'JPY', petrol: 175,  diesel: 155,  lpg: 110 },
  KR: { currency: 'KRW', petrol: 1700, diesel: 1550, lpg: 1050 },
  CN: { currency: 'CNY', petrol: 8.0,  diesel: 7.6,  lpg: 5 },
  IN: { currency: 'INR', petrol: 100,  diesel: 92,   lpg: 60 },
  TH: { currency: 'THB', petrol: 42,   diesel: 33,   lpg: 20 },
  SG: { currency: 'SGD', petrol: 2.80, diesel: 2.50, lpg: 1.50 },
  MY: { currency: 'MYR', petrol: 2.05, diesel: 2.15, lpg: 1.20 },
  ID: { currency: 'IDR', petrol: 13000,diesel: 13000,lpg: 8000 },
  AE: { currency: 'AED', petrol: 2.90, diesel: 3.00, lpg: 2.00 },
  SA: { currency: 'SAR', petrol: 2.33, diesel: 1.15, lpg: 1.50 },
  ZA: { currency: 'ZAR', petrol: 23,   diesel: 22,   lpg: 15 },
  BR: { currency: 'BRL', petrol: 5.90, diesel: 6.10, lpg: 4.00 },
  AR: { currency: 'ARS', petrol: 1000, diesel: 1100, lpg: 600 },
  CL: { currency: 'CLP', petrol: 1250, diesel: 1100, lpg: 700 },
};
// Used when the country is unknown or not in the table.
const WORLD: CountryFuel = { currency: 'USD', petrol: 1.20, diesel: 1.15, lpg: 0.75 };

export interface PriceResult { pricePerLiter: number; currency: string; source: string }

/** The built-in average price for a country + fuel type (the offline fallback). */
export function averagePrice(country: string | null, fuel: FuelType): PriceResult {
  const cc = (country || '').toUpperCase();
  const row = PRICES[cc];
  if (!row) return { pricePerLiter: WORLD[fuel], currency: WORLD.currency, source: 'world avg' };
  return { pricePerLiter: row[fuel], currency: row.currency, source: `${cc} avg` };
}

/** Reverse-geocode a coordinate to an ISO country code (Photon, same source as
 *  the place search). Best-effort; returns null on any failure. */
export async function countryAt(lat: number, lng: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    const code = j?.features?.[0]?.properties?.countrycode;
    return typeof code === 'string' ? code.toUpperCase() : null;
  } catch { return null; }
}

/**
 * Best-effort *live* price near a coordinate, falling back to the country
 * average. Live coverage today comes from free, keyless open-government data:
 *  • France — the national "prix des carburants" instant feed (nearest stations).
 * Everywhere else uses the editable average estimate. Always resolves — never
 * throws — so the caller can just show whatever it gets.
 */
export async function livePrice(lat: number, lng: number, country: string | null, fuel: FuelType): Promise<PriceResult> {
  const fallback = averagePrice(country, fuel);
  const cc = (country || '').toUpperCase();
  try {
    if (cc === 'FR') {
      const p = await franceLive(lat, lng, fuel);
      if (p != null) return { pricePerLiter: p, currency: 'EUR', source: 'FR live' };
    }
  } catch { /* fall through to the average */ }
  return fallback;
}

/** France open-data instant fuel feed: median price of the fuel type within a
 *  radius of the point. Returns €/litre, or null if nothing usable came back. */
async function franceLive(lat: number, lng: number, fuel: FuelType): Promise<number | null> {
  const col = fuel === 'diesel' ? 'gazole_prix' : fuel === 'lpg' ? 'gplc_prix' : 'sp95_prix';
  const url = 'https://data.economie.gouv.fr/api/records/1.0/search/'
    + '?dataset=prix-des-carburants-en-france-flux-instantane-v2'
    + `&geofilter.distance=${lat},${lng},25000&rows=40`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  const r = await fetch(url, { signal: ctrl.signal });
  clearTimeout(t);
  const j = await r.json();
  const vals: number[] = [];
  for (const rec of j?.records ?? []) {
    const raw = rec?.fields?.[col];
    const v = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    // Some feeds report prices in €/1000L (e.g. 1789) rather than €/L (1.789).
    if (!isNaN(v) && v > 0) vals.push(v > 20 ? v / 1000 : v);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}
