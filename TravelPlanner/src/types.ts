/**
 * Trip Planner — data model for all 9 tabs.
 *
 * Every stored record extends `SyncMeta` so the sync engine and change log
 * can track *what* changed, *when*, and on *which device*. Deletes are
 * "tombstones" (deleted:true) rather than hard removals, so a delete on one
 * device can propagate to the others on the next sync.
 */

export type ISODate = string;   // 'YYYY-MM-DD'
export type ISOTime = string;   // 'HH:MM'
export type ISOStamp = string;  // full ISO timestamp

export interface SyncMeta {
  id: string;
  updatedAt: ISOStamp;   // last modification time
  updatedBy: string;     // device name that made the change
  deleted?: boolean;     // tombstone
}

/* ── Travelers (shared across tabs) ─────────────────────────── */
export interface Traveler extends SyncMeta {
  kind: 'traveler';
  name: string;
  role: 'adult' | 'child';
  emoji: string;         // avatar emoji (fallback when no photo)
  photo?: string;        // optional profile-picture URL (uploaded like trip photos)
}

/* ── 1. Travel Documents ────────────────────────────────────── */
export type DocType =
  | 'passport' | 'visa' | 'id' | 'insurance'
  | 'ticket' | 'reservation' | 'vaccination' | 'other';

export interface TravelDocument extends SyncMeta {
  kind: 'document';
  title: string;
  docType: DocType;
  travelerId: string | null; // whose doc (null = whole family)
  number: string;            // passport/policy/confirmation number
  issuer: string;            // issuing country / company
  issueDate: ISODate | '';
  expiryDate: ISODate | '';  // triggers expiry warnings
  notes: string;
  photoData: string;         // base64 data URL of a scan/photo (stored locally)
}

/* ── 2. Checklist ───────────────────────────────────────────── */
export type ChecklistCategory =
  | 'packing' | 'before-leaving' | 'reservations' | 'documents' | 'health' | 'tech' | 'other';

export interface ChecklistItem extends SyncMeta {
  kind: 'checklist';
  text: string;
  category: ChecklistCategory;
  done: boolean;
  assignedTo: string | null; // travelerId or null
  dueDate: ISODate | '';
  notes?: string;
}

/* ── 3. Transport Details ───────────────────────────────────── */
export type TransportMode = 'flight' | 'train' | 'bus' | 'car' | 'ferry' | 'transfer' | 'other';

export interface Transport extends SyncMeta {
  kind: 'transport';
  mode: TransportMode;
  provider: string;          // airline / rail company
  fromPlace: string;
  toPlace: string;
  departDate: ISODate;
  departTime: ISOTime | '';
  arriveDate: ISODate | '';
  arriveTime: ISOTime | '';
  confirmation: string;      // booking reference
  seat: string;
  cost: number;
  costCurrency?: string;     // currency of `cost` (defaults to trip currency)
  notes: string;
}

/* ── 4. Accommodation Details ───────────────────────────────── */
export interface Accommodation extends SyncMeta {
  kind: 'accommodation';
  name: string;
  address: string;
  city: string;
  checkIn: ISODate;
  checkOut: ISODate;
  confirmation: string;
  cost: number;
  costCurrency?: string;     // currency of `cost` (defaults to trip currency)
  contact: string;           // phone / email
  notes: string;
}

/* ── 5. Expense Tracker ─────────────────────────────────────── */
export type ExpenseCategory =
  | 'food' | 'transport' | 'lodging' | 'activities' | 'shopping' | 'other';

export interface Expense extends SyncMeta {
  kind: 'expense';
  title: string;
  amount: number;
  currency: string;          // 'EUR', 'USD', ...
  category: ExpenseCategory;
  date: ISODate;
  paidBy: string | null;     // travelerId
  place: string;
  notes: string;
}

/* ── 6. Itinerary Planner ───────────────────────────────────── */
export interface ItineraryEvent extends SyncMeta {
  kind: 'itinerary';
  title: string;
  date: ISODate;
  startTime: ISOTime | '';
  endTime: ISOTime | '';
  place: string;
  category: 'sightseeing' | 'food' | 'travel' | 'rest' | 'event' | 'other';
  cost: number;          // estimated / actual cost for this activity
  costCurrency?: string; // currency of `cost` (defaults to trip currency)
  notes: string;
}

/* ── 7. Budget Tracker ──────────────────────────────────────── */
export interface BudgetLine extends SyncMeta {
  kind: 'budget';
  category: ExpenseCategory;
  planned: number;           // planned amount for this category
}

/* ── 8. Trip Overview (single meta record, id = 'trip') ─────── */
export interface TripMeta extends SyncMeta {
  kind: 'trip';
  name: string;
  destinations: string;      // "France · Italy · Spain"
  startDate: ISODate;
  endDate: ISODate;
  homeCurrency: string;      // 'USD'
  tripCurrency: string;      // 'EUR'
  totalBudget: number;
  notes: string;
}

/* ── Photos & files (stored locally, synced to the group) ───── */
export interface TripPhoto extends SyncMeta {
  kind: 'photo';
  data?: string;          // local-first image as a data: URI (synced to all)
  url?: string;           // legacy: Supabase Storage URL (older cloud photos)
  caption: string;
  place: string;          // optional location label
  lat: number | null;     // optional GPS
  lng: number | null;
  takenAt: ISOStamp;      // capture time
  folder: string;         // grouping folder (e.g. Documents, Bills, Recipes)
}

/* ── Change Log ─────────────────────────────────────────────── */
export type ChangeAction = 'create' | 'update' | 'delete' | 'sync';

export interface ChangeLogEntry {
  id: string;
  at: ISOStamp;
  device: string;
  action: ChangeAction;
  entity: string;            // 'expense', 'document', ...
  recordId: string;
  summary: string;           // human-readable "Added expense: Lunch €24"
  field?: string;            // for updates
  before?: string;
  after?: string;
}

/* ── Union of all synced records ────────────────────────────── */
export type AnyRecord =
  | Traveler | TravelDocument | ChecklistItem | Transport
  | Accommodation | Expense | ItineraryEvent | BudgetLine | TripMeta | TripPhoto;

export type EntityKind = AnyRecord['kind'];

/* ── Display metadata ───────────────────────────────────────── */
import { convert, getHomeCurrency, getAwayCurrency } from './lib/currency';

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ', JPY: '¥', CAD: 'CA$', AUD: 'A$', PLN: 'zł',
};

/** Format a single amount in one currency (e.g. "€24.00", "zł98.00"). */
export function money1(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Dual-currency money string — always shows the away currency and its
 * home-currency (CAD) equivalent, e.g. "€24.00 · CA$35.60". `currency` is the
 * currency the stored amount is in (normally the away currency).
 */
export function money(amount: number, currency: string): string {
  const away = getAwayCurrency();
  const home = getHomeCurrency();
  const awayStr = money1(convert(amount, currency, away), away);
  const homeStr = money1(convert(amount, currency, home), home);
  return `${awayStr} · ${homeStr}`;
}

/** Just the home-currency (CAD) value, e.g. "CA$148.91". */
export function moneyHome(amount: number, currency: string): string {
  const home = getHomeCurrency();
  return money1(convert(amount, currency, home), home);
}

/** Just the away-currency (EUR/PLN) value, e.g. "€100.00". */
export function moneyAway(amount: number, currency: string): string {
  const away = getAwayCurrency();
  return money1(convert(amount, currency, away), away);
}

/** Sum items that may each be in a different currency into one currency. */
export function sumExpenses(items: { amount: number; currency: string }[], to: string): number {
  return items.reduce((s, e) => s + convert(e.amount, e.currency, to), 0);
}
