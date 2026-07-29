/**
 * Reactive hooks over the local database. `useLiveQuery` re-renders any
 * component automatically whenever the underlying data changes — including
 * after a sync pulls in updates from another device.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, activeRows } from '../db/database';
import type {
  Traveler, TravelDocument, ChecklistItem, Transport, Accommodation, CarRental,
  Expense, ItineraryEvent, BudgetLine, BudgetSheet, TripMeta, TripPhoto, MapPin, ChatMessage, Suggestion, FuelRoute, ChangeLogEntry,
} from '../types';

export const useTrip = () =>
  useLiveQuery(() => db.trip.get('trip'), []) as TripMeta | undefined;

export const useTravelers = () =>
  activeRows<Traveler>(useLiveQuery(() => db.travelers.toArray(), []));

export const useDocuments = () =>
  activeRows<TravelDocument>(useLiveQuery(() => db.documents.toArray(), []));

export const useChecklist = () =>
  activeRows<ChecklistItem>(useLiveQuery(() => db.checklist.toArray(), []));

export const useTransport = () =>
  activeRows<Transport>(useLiveQuery(() => db.transport.toArray(), []))
    .sort((a, b) => (a.departDate + a.departTime).localeCompare(b.departDate + b.departTime));

export const useAccommodation = () =>
  activeRows<Accommodation>(useLiveQuery(() => db.accommodation.toArray(), []))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

export const useCarRentals = () =>
  activeRows<CarRental>(useLiveQuery(() => db.carrentals.toArray(), []))
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));

export const useExpenses = () =>
  activeRows<Expense>(useLiveQuery(() => db.expenses.toArray(), []))
    .sort((a, b) => b.date.localeCompare(a.date));

export const useItinerary = () =>
  activeRows<ItineraryEvent>(useLiveQuery(() => db.itinerary.toArray(), []))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

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
    .sort((a, b) => (b.updatedAt).localeCompare(a.updatedAt));

export const useChangelog = () =>
  (useLiveQuery(() => db.changelog.orderBy('at').reverse().limit(200).toArray(), []) ?? []) as ChangeLogEntry[];

/** Look up a traveler's display name by id. */
export function travelerName(travelers: Traveler[], id: string | null): string {
  if (!id) return 'Everyone';
  return travelers.find(t => t.id === id)?.name ?? 'Unknown';
}
