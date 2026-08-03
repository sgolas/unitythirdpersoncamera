/**
 * Local-first database (IndexedDB via Dexie).
 *
 * All trip data lives on the device. Every write goes through `put()` /
 * `remove()` here, which stamps sync metadata AND records a change-log entry
 * automatically — so the Change Log tab and the sync engine both stay honest
 * without each tab having to remember to log anything.
 */
import Dexie, { type Table } from 'dexie';
import type {
  Traveler, TravelDocument, ChecklistItem, Transport, Accommodation, CarRental,
  Expense, ItineraryEvent, BudgetLine, BudgetSheet, TripMeta, TripPhoto, MapPin, ChatMessage, Suggestion, FuelRoute, ChangeLogEntry,
  TimelineStop, TimelineLegendItem, Activity,
  AnyRecord, EntityKind, ChangeAction,
} from '../types';

class TripDB extends Dexie {
  travelers!:      Table<Traveler, string>;
  documents!:      Table<TravelDocument, string>;
  checklist!:      Table<ChecklistItem, string>;
  transport!:      Table<Transport, string>;
  accommodation!:  Table<Accommodation, string>;
  carrentals!:     Table<CarRental, string>;
  expenses!:       Table<Expense, string>;
  itinerary!:      Table<ItineraryEvent, string>;
  budget!:         Table<BudgetLine, string>;
  trip!:           Table<TripMeta, string>;
  photos!:         Table<TripPhoto, string>;
  mappins!:        Table<MapPin, string>;
  chat!:           Table<ChatMessage, string>;
  suggestions!:    Table<Suggestion, string>;
  fuelroutes!:     Table<FuelRoute, string>;
  budgetsheets!:   Table<BudgetSheet, string>;
  timelinestops!:  Table<TimelineStop, string>;
  timelinelegend!: Table<TimelineLegendItem, string>;
  activities!:     Table<Activity, string>;
  changelog!:      Table<ChangeLogEntry, string>;

  constructor() {
    super('trip-planner');
    this.version(1).stores({
      travelers:     'id, updatedAt',
      documents:     'id, docType, travelerId, updatedAt',
      checklist:     'id, category, done, updatedAt',
      transport:     'id, mode, departDate, updatedAt',
      accommodation: 'id, checkIn, updatedAt',
      expenses:      'id, category, date, updatedAt',
      itinerary:     'id, date, updatedAt',
      budget:        'id, category, updatedAt',
      trip:          'id, updatedAt',
      changelog:     'id, at, entity',
    });
    // v2 adds the photos table.
    this.version(2).stores({
      photos:        'id, folder, takenAt, updatedAt',
    });
    // v3 adds custom map pins.
    this.version(3).stores({
      mappins:       'id, updatedAt',
    });
    // v4 adds the family chat.
    this.version(4).stores({
      chat:          'id, at, updatedAt',
    });
    // v5 adds car rentals.
    this.version(5).stores({
      carrentals:    'id, pickupDate, updatedAt',
    });
    // v6 adds group activity suggestions (approve → itinerary).
    this.version(6).stores({
      suggestions:   'id, date, updatedAt',
    });
    // v7 adds fuel/driving route plans.
    this.version(7).stores({
      fuelroutes:    'id, updatedAt',
    });
    // v8 adds named budget sheets (per-country/stop sub-budgets).
    this.version(8).stores({
      budgetsheets:  'id, order, updatedAt',
    });
    // v9 adds the Trip Timeline: extra stops + an editable legend of types.
    this.version(9).stores({
      timelinestops:  'id, startDate, order, updatedAt',
      timelinelegend: 'id, key, order, updatedAt',
    });
    // v10 adds booked activities / experiences.
    this.version(10).stores({
      activities:     'id, date, updatedAt',
    });
  }
}

export const db = new TripDB();

/* Map an entity kind to its Dexie table. */
const TABLES: Record<EntityKind, Table<any, string>> = {
  traveler:      db.travelers,
  document:      db.documents,
  checklist:     db.checklist,
  transport:     db.transport,
  accommodation: db.accommodation,
  carrental:     db.carrentals,
  expense:       db.expenses,
  itinerary:     db.itinerary,
  budget:        db.budget,
  trip:          db.trip,
  photo:         db.photos,
  mappin:        db.mappins,
  chatmsg:       db.chat,
  suggestion:    db.suggestions,
  fuelroute:     db.fuelroutes,
  budgetsheet:   db.budgetsheets,
  timelinestop:  db.timelinestops,
  timelinelegend: db.timelinelegend,
  activity:      db.activities,
};

export function tableFor(kind: EntityKind): Table<any, string> {
  return TABLES[kind];
}

/* ── Device identity ────────────────────────────────────────── */
const DEVICE_KEY = 'trip.deviceName';

export function getDeviceName(): string {
  let name = localStorage.getItem(DEVICE_KEY);
  if (!name) {
    // Friendly default guess; user can rename in Settings.
    const guess = /iphone|ipad|ios/i.test(navigator.userAgent) ? 'iPhone'
      : /android/i.test(navigator.userAgent) ? 'Android phone'
      : 'This device';
    name = guess;
    localStorage.setItem(DEVICE_KEY, name);
  }
  return name;
}

export function setDeviceName(name: string) {
  localStorage.setItem(DEVICE_KEY, name.trim() || 'This device');
}

/* Which traveler is using this device — powers "colour by who added it". */
const ME_KEY = 'trip.meTravelerId';
export function getMyTravelerId(): string { return localStorage.getItem(ME_KEY) ?? ''; }
export function setMyTravelerId(id: string) {
  if (id) localStorage.setItem(ME_KEY, id); else localStorage.removeItem(ME_KEY);
  try { window.dispatchEvent(new Event('me-changed')); } catch { /* SSR */ }
}

/* Signal that data changed so the on-device backup can re-save (debounced). */
function notifyChange() {
  try { window.dispatchEvent(new Event('trip-data-changed')); } catch { /* SSR */ }
}

/* ── Change-log helper ──────────────────────────────────────── */
export async function logChange(entry: Omit<ChangeLogEntry, 'id' | 'at' | 'device'>) {
  await db.changelog.add({
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    device: getDeviceName(),
  });
  notifyChange();
}

/* ── Generic write API (auto-logs) ──────────────────────────── */

/**
 * Create or update a record. Stamps updatedAt/updatedBy and writes a
 * change-log entry describing what happened.
 */
export async function put<T extends AnyRecord>(
  record: T,
  summary: string,
  action: ChangeAction = 'update',
): Promise<T> {
  // Stamp the author once, on creation, so a title can be coloured by who
  // added it. Never overwrite an existing author on later edits.
  const me = getMyTravelerId();
  const authorId = (record as AnyRecord).authorId ?? (action === 'create' && me ? me : undefined);
  const stamped = {
    ...record,
    updatedAt: new Date().toISOString(),
    updatedBy: getDeviceName(),
    ...(authorId ? { authorId } : {}),
  } as T;
  await tableFor(record.kind).put(stamped);
  await logChange({
    action,
    entity: record.kind,
    recordId: record.id,
    summary,
  });
  return stamped;
}

/** Soft-delete (tombstone) a record so the delete can sync to other devices. */
export async function remove(kind: EntityKind, id: string, summary: string): Promise<void> {
  const table = tableFor(kind);
  const existing = await table.get(id);
  if (!existing) return;
  await table.put({
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
    updatedBy: getDeviceName(),
  });
  await logChange({ action: 'delete', entity: kind, recordId: id, summary });
}

/** Live-query helper: non-deleted rows of a table. */
export function activeRows<T extends AnyRecord>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter(r => !r.deleted);
}
