/**
 * Reactive hooks over the local database. `useLiveQuery` re-renders any
 * component automatically whenever the underlying data changes — including
 * after a sync pulls in updates from another device.
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, activeRows } from '../db/database';
import type {
  Traveler, TravelDocument, ChecklistItem, Transport, Accommodation, CarRental,
  Expense, ExpenseCategory, ItineraryEvent, BudgetLine, BudgetSheet, TripMeta, TripPhoto, MapPin, ChatMessage, Suggestion, FuelRoute, ChangeLogEntry,
  TimelineStop, TimelineLegendItem, Activity,
} from '../types';

export const useTrip = () =>
  useLiveQuery(() => db.trip.get('trip'), []) as TripMeta | undefined;

export const useTravelers = () =>
  activeRows<Traveler>(useLiveQuery(() => db.travelers.toArray(), []));

export const useDocuments = () =>
  activeRows<TravelDocument>(useLiveQuery(() => db.documents.toArray(), []));

// A manual `order` (set by dragging) wins; otherwise the natural sort applies.
const byOrder = <T extends { order?: number }>(fallback: (a: T, b: T) => number) =>
  (a: T, b: T) => (a.order ?? Infinity) - (b.order ?? Infinity) || fallback(a, b);

export const useChecklist = () =>
  activeRows<ChecklistItem>(useLiveQuery(() => db.checklist.toArray(), []))
    .sort(byOrder(() => 0));

export const useTransport = () =>
  activeRows<Transport>(useLiveQuery(() => db.transport.toArray(), []))
    .sort(byOrder((a, b) => (a.departDate + a.departTime).localeCompare(b.departDate + b.departTime)));

export const useAccommodation = () =>
  activeRows<Accommodation>(useLiveQuery(() => db.accommodation.toArray(), []))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

export const useCarRentals = () =>
  activeRows<CarRental>(useLiveQuery(() => db.carrentals.toArray(), []))
    .sort(byOrder((a, b) => a.pickupDate.localeCompare(b.pickupDate)));

export const useActivities = () =>
  activeRows<Activity>(useLiveQuery(() => db.activities.toArray(), []))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

export const useTimelineStops = () =>
  activeRows<TimelineStop>(useLiveQuery(() => db.timelinestops.toArray(), []))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.order - b.order));

export const useTimelineLegend = () =>
  activeRows<TimelineLegendItem>(useLiveQuery(() => db.timelinelegend.toArray(), []))
    .sort((a, b) => a.order - b.order);

export const useExpenses = () =>
  activeRows<Expense>(useLiveQuery(() => db.expenses.toArray(), []))
    .sort((a, b) => b.date.localeCompare(a.date));

/** An item in the Expenses tally: either a real logged expense, or a read-only
 *  item derived from a booking's cost (stay / transport / car rental). */
export type SpendItem = Expense & { auto?: boolean; source?: 'accommodation' | 'transport' | 'carrental' | 'activity' };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Turn booking costs (stays, transport, car rentals, activities) into read-only
 *  expense items so they count toward the Expenses/Budget tally automatically. */
export function bookingSpend(
  stays: Accommodation[], transport: Transport[], cars: CarRental[], cur: string, activities: Activity[] = [],
  autoSheet: Record<string, string> = {},
): SpendItem[] {
  const mk = (
    id: string, source: SpendItem['source'], title: string, amount: number,
    currency: string, category: ExpenseCategory, date: string, place: string,
  ): SpendItem => ({
    kind: 'expense', id, title, amount, currency, category, date,
    paidBy: null, place, notes: '', sheetId: autoSheet[id] ?? null, updatedAt: '', updatedBy: '',
    auto: true, source,
  });
  const items: SpendItem[] = [];
  for (const s of stays) if (s.cost > 0)
    items.push(mk(`auto-acc-${s.id}`, 'accommodation', s.name || 'Stay', s.cost, s.costCurrency ?? cur, 'lodging', s.checkIn, s.city || s.address || ''));
  for (const t of transport) if (t.cost > 0)
    items.push(mk(`auto-trn-${t.id}`, 'transport', t.provider ? `${cap(t.mode)} · ${t.provider}` : cap(t.mode) || 'Transport', t.cost, t.costCurrency ?? cur, 'transport', t.departDate, [t.fromPlace, t.toPlace].filter(Boolean).join(' → ')));
  for (const c of cars) if (c.cost > 0)
    items.push(mk(`auto-car-${c.id}`, 'carrental', c.company ? `${c.company} car` : 'Car rental', c.cost, c.costCurrency ?? cur, 'transport', c.pickupDate, c.pickupLocation || ''));
  for (const a of activities) if (a.cost > 0)
    items.push(mk(`auto-act-${a.id}`, 'activity', a.title || 'Activity', a.cost, a.costCurrency ?? cur, 'activities', a.date, a.location || a.provider || ''));
  return items;
}

/** All trip spend: real expenses plus booking-derived items, newest first. */
export function useSpend(): SpendItem[] {
  const trip = useTrip();
  const expenses = useExpenses();
  const stays = useAccommodation();
  const transport = useTransport();
  const cars = useCarRentals();
  const activities = useActivities();
  const cur = trip?.tripCurrency ?? 'EUR';
  const autoSheet = trip?.autoSheet;
  return useMemo(
    () => [...(expenses as SpendItem[]), ...bookingSpend(stays, transport, cars, cur, activities, autoSheet ?? {})]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [expenses, stays, transport, cars, activities, cur, autoSheet],
  );
}

export const useItinerary = () =>
  activeRows<ItineraryEvent>(useLiveQuery(() => db.itinerary.toArray(), []))
    .sort(byOrder((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));

export const useBudget = () =>
  activeRows<BudgetLine>(useLiveQuery(() => db.budget.toArray(), []));

export const useBudgetSheets = () =>
  activeRows<BudgetSheet>(useLiveQuery(() => db.budgetsheets.toArray(), []))
    .sort((a, b) => a.order - b.order);

export const usePhotos = () =>
  activeRows<TripPhoto>(useLiveQuery(() => db.photos.toArray(), []))
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));

export const useChat = () =>
  activeRows<ChatMessage>(useLiveQuery(() => db.chat.orderBy('at').toArray(), []));

export const useMapPins = () =>
  activeRows<MapPin>(useLiveQuery(() => db.mappins.toArray(), []))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

export const useSuggestions = () =>
  activeRows<Suggestion>(useLiveQuery(() => db.suggestions.toArray(), []))
    .sort((a, b) => (b.updatedAt).localeCompare(a.updatedAt));

export const useFuelRoutes = () =>
  activeRows<FuelRoute>(useLiveQuery(() => db.fuelroutes.toArray(), []))
    // Manual order first (when set); newest-first for anything unordered.
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || b.updatedAt.localeCompare(a.updatedAt));

export const useChangelog = () =>
  (useLiveQuery(() => db.changelog.orderBy('at').reverse().limit(200).toArray(), []) ?? []) as ChangeLogEntry[];

/** Look up a traveler's display name by id. */
export function travelerName(travelers: Traveler[], id: string | null): string {
  if (!id) return 'Everyone';
  return travelers.find(t => t.id === id)?.name ?? 'Unknown';
}
