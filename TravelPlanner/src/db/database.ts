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
  Traveler, TravelDocument, ChecklistItem, Transport, Accommodation,
  Expense, ItineraryEvent, BudgetLine, TripMeta, ChangeLogEntry,
  AnyRecord, EntityKind, ChangeAction,
} from '../types';

class TripDB extends Dexie {
  travelers!:      Table<Traveler, string>;
  documents!:      Table<TravelDocument, string>;
  checklist!:      Table<ChecklistItem, string>;
  transport!:      Table<Transport, string>;
  accommodation!:  Table<Accommodation, string>;
  expenses!:       Table<Expense, string>;
  itinerary!:      Table<ItineraryEvent, string>;
  budget!:         Table<BudgetLine, string>;
  trip!:           Table<TripMeta, string>;
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
  expense:       db.expenses,
  itinerary:     db.itinerary,
  budget:        db.budget,
  trip:          db.trip,
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

/* ── Change-log helper ──────────────────────────────────────── */
export async function logChange(entry: Omit<ChangeLogEntry, 'id' | 'at' | 'device'>) {
  await db.changelog.add({
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    device: getDeviceName(),
  });
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
  const stamped = {
    ...record,
    updatedAt: new Date().toISOString(),
    updatedBy: getDeviceName(),
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
