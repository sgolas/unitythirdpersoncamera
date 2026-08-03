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
  | 'ticket' | 'reservation' | 'vaccination'
  | 'flightreceipt' | 'purchasereceipt' | 'warranty' | 'other';

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
  // Optional attachment (PDF or image) that can be viewed + saved to the phone.
  fileData?: string;         // base64 data URL of the original file
  fileName?: string;         // original filename, used when saving/downloading
  fileMime?: string;         // e.g. 'application/pdf' or 'image/jpeg'
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
  order?: number;            // manual position in the list
  fileData?: string;         // attached document (PDF or photo), synced
  fileName?: string;
  fileMime?: string;
}

/* ── 3. Transport Details ───────────────────────────────────── */
export type TransportMode = 'flight' | 'train' | 'bus' | 'car' | 'ferry' | 'transfer' | 'other';

export interface Transport extends SyncMeta {
  kind: 'transport';
  mode: TransportMode;
  provider: string;          // airline / rail company
  flightNumber?: string;     // e.g. "AC848" — enables live flight status
  fromPlace: string;
  toPlace: string;
  fromLat?: number | null;   // exact position when picked from search
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  departDate: ISODate;
  departTime: ISOTime | '';
  arriveDate: ISODate | '';
  arriveTime: ISOTime | '';
  confirmation: string;      // booking reference
  seat: string;
  cost: number;
  costCurrency?: string;     // currency of `cost` (defaults to trip currency)
  notes: string;
  order?: number;            // manual position in the list
  fileData?: string;         // attached ticket/confirmation (PDF or photo), synced
  fileName?: string;
  fileMime?: string;
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
  // Optional attachment — e.g. the original booking-confirmation PDF kept with
  // the stay (synced to the family). Viewable + saveable from the stay detail.
  fileData?: string;         // base64 data URL of the file
  fileName?: string;         // original filename, used when saving
  fileMime?: string;         // e.g. 'application/pdf'
}

/* ── 4b. Car Rentals ────────────────────────────────────────── */
export interface CarRental extends SyncMeta {
  kind: 'carrental';
  company: string;              // rental company (Hertz, Avis, Sixt…)
  carType: string;              // vehicle / class (e.g. "SUV — VW Tiguan")
  pickupLocation: string;
  pickupDate: ISODate;
  pickupTime: ISOTime | '';
  dropoffLocation: string;
  dropoffDate: ISODate | '';
  dropoffTime: ISOTime | '';
  confirmation: string;         // reservation / booking number
  driver: string;               // main driver's name
  contact: string;              // branch phone / email
  cost: number;
  costCurrency?: string;        // currency of `cost` (defaults to trip currency)
  notes: string;
  receipts: string[];           // receipt/document photos as data: URIs (local-first, synced)
  order?: number;               // manual position in the list
  fileData?: string;            // attached agreement/voucher (PDF or photo), synced
  fileName?: string;
  fileMime?: string;
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
  sheetId?: string | null;   // budget sheet this expense counts toward (null = General)
  excludeFromBudget?: boolean; // logged, but left out of every budget/spent total
}

/** True when an item should count toward budget/spent totals (default: yes). */
export const countsToBudget = (e: { excludeFromBudget?: boolean }): boolean => !e.excludeFromBudget;

/* ── Activities & experiences (booked tours, tickets, reservations) ──
 * Mirrors Stays: importable from a receipt/booking PDF, with the original file
 * kept alongside. Costs feed the budget under the 'activities' category. */
export interface Activity extends SyncMeta {
  kind: 'activity';
  title: string;             // e.g. "Sagrada Família skip-the-line tour"
  provider: string;          // GetYourGuide / Viator / OpenTable / … (optional)
  date: ISODate;
  startTime: ISOTime | '';
  endTime: ISOTime | '';
  location: string;          // place or address
  confirmation: string;
  cost: number;
  costCurrency?: string;
  notes: string;
  // Optional attachment — the original booking/receipt PDF (synced).
  fileData?: string;
  fileName?: string;
  fileMime?: string;
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
  order?: number;        // manual position in the list
  fileData?: string;     // attached document (PDF or photo), synced
  fileName?: string;
  fileMime?: string;
}

/* ── 7. Budget Tracker ──────────────────────────────────────── */
export interface BudgetLine extends SyncMeta {
  kind: 'budget';
  category: ExpenseCategory;
  planned: number;           // planned amount for this category
  sheetId?: string | null;   // which budget sheet (undefined/null = General)
}

/** A named sub-budget, e.g. one per country/stop on a multi-stop trip. */
export interface BudgetSheet extends SyncMeta {
  kind: 'budgetsheet';
  name: string;              // "France", "Italy", …
  total: number;             // planned total for this sheet (trip currency)
  order: number;             // display order
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
  // Manual order for the Trip Timeline (unified stop ids in display order). New
  // items still slot in chronologically until the user drags them.
  timelineOrder?: string[];
  // Ids of timeline items marked "completed" (turn green). Covers stays, drives
  // and stops uniformly, so it works for the read-only derived items too.
  timelineCompleted?: string[];
  // Budget-sheet assignment for auto/booking-derived spend items (keyed by the
  // synthetic item id, e.g. "auto-acc-<id>"). Absent = General.
  autoSheet?: Record<string, string>;
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

/* ── Map pins (custom markers dropped on the trip map) ──────── */
export type PinCategory = 'flight' | 'restaurant' | 'attraction' | 'hotel' | 'other';

export interface MapPin extends SyncMeta {
  kind: 'mappin';
  label: string;       // short name for the spot
  note: string;        // free-text details / info
  emoji: string;       // marker glyph
  category?: PinCategory; // filterable type (older pins count as 'other')
  lat: number;
  lng: number;
}

/* ── Suggestions (proposed activities awaiting group approval) ── */
export interface Suggestion extends SyncMeta {
  kind: 'suggestion';
  title: string;                       // event name
  date: ISODate | '';
  startTime: ISOTime | '';
  place: string;                       // location
  category: ItineraryEvent['category'];
  description: string;
  link: string;                        // external link
  photos: string[];                    // data: URIs (stored locally, synced)
  notes: string;
  cost: number;                        // price
  costCurrency?: string;
  proposedBy: string;                  // who suggested it
  approvals: string[];                 // traveler ids who have approved
  itineraryId?: string;                // set once it's added to the itinerary (dedupe)
}

/* ── Family chat (messages sync to the whole group) ─────────── */
export interface ChatMessage extends SyncMeta {
  kind: 'chatmsg';
  text: string;
  author: string;    // display name picked by the sender
  emoji: string;     // avatar emoji shown next to the name
  at: ISOStamp;      // send time
  deviceId?: string; // random per-install id — device names can collide
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

/* ── Fuel & driving cost ────────────────────────────────────── */
// Liquid-fuel units plus electric energy units (kWh/100km, mi/kWh).
export type EconomyUnit = 'l100' | 'kml' | 'mpgus' | 'mpguk' | 'kwh100' | 'mikwh';
export type FuelType = 'petrol' | 'diesel' | 'lpg' | 'electric';
export interface FuelWaypoint { label: string; lat: number; lng: number }
export interface FuelRoute extends SyncMeta {
  kind: 'fuelroute';
  name: string;
  waypoints: FuelWaypoint[];    // start, …stops, destination (in travel order)
  roundTrip: boolean;           // add the return leg back to the start
  vehicle?: string;             // picked car model name (e.g. "Volkswagen Golf")
  year?: number;                // model year (affects the economy estimate)
  economy: number;              // vehicle fuel economy, in `economyUnit`
  economyUnit: EconomyUnit;
  fuelType: FuelType;
  pricePerLiter: number;        // fuel price per litre, in `priceCurrency`
  priceCurrency: string;        // currency of the price (e.g. EUR, USD)
  priceSource: string;          // where the price came from ('FR live', 'DE avg', 'manual')
  distanceKm: number;           // last computed road distance (cache for display)
  durationMin?: number;         // one-way driving time in minutes (from the router)
  departDate?: ISODate;         // when the drive starts (optional; used for the timeline)
  departTime?: ISOTime;         // departure time → arrival is departure + durationMin
  order?: number;               // manual position in the Fuel & Driving list
  notes: string;
}

/* ── 18. Trip Timeline ──────────────────────────────────────────
 * A horizontal, date-ordered timeline of a trip. Overnight stops are derived
 * live from Accommodation (Stays) and stay read-only here; the records below
 * are the *extra* stops (day trips, buffers, an end marker, custom types) that
 * the user inserts between stays. The legend is an editable list of stop
 * "types", each with a dot style — adding one defines a new assignable type.  */

/** A dot style. Colors are semantic tokens (resolved to theme-aware CSS vars)
 *  or raw hex, so the timeline reads correctly in both light and dark mode. */
export type TimelineColor = 'route' | 'accent' | 'ink' | 'paper' | 'muted' | string;
export interface TimelineSwatch {
  fill: TimelineColor;        // dot fill
  border?: TimelineColor;     // optional ring/border colour
  borderWidth?: number;       // border width in px (day-style dots use ~3)
}

/** An extra stop the user added to the timeline (not backed by a Stay). */
export interface TimelineStop extends SyncMeta {
  kind: 'timelinestop';
  city: string;
  startDate: ISODate;
  endDate: ISODate | null;    // null = single-day stop
  type: string;               // references a TimelineLegendItem.key
  tags: string[];
  order: number;              // tiebreak for stops sharing a start date
}

/** An entry in the editable legend — also the catalogue of assignable types. */
export interface TimelineLegendItem extends SyncMeta {
  kind: 'timelinelegend';
  key: string;                // stable type id (e.g. 'overnight' | 'day' | 'end')
  label: string;              // display name
  swatch: TimelineSwatch;
  order: number;              // display order
  builtin?: boolean;          // overnight/day/end — kept undeletable
}

/* ── Union of all synced records ────────────────────────────── */
export type AnyRecord =
  | Traveler | TravelDocument | ChecklistItem | Transport
  | Accommodation | CarRental | Expense | ItineraryEvent | BudgetLine | BudgetSheet | TripMeta | TripPhoto | MapPin | ChatMessage | Suggestion | FuelRoute
  | TimelineStop | TimelineLegendItem | Activity;

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
