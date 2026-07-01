/**
 * First-run seed. Pre-fills the trip with the known details so the app opens
 * with something real instead of a blank slate. Only runs when the DB is empty.
 */
import { db, getDeviceName } from './database';
import type { TripMeta, Traveler } from '../types';

export async function seedIfEmpty() {
  const existing = await db.trip.get('trip');
  if (existing) return;

  const now = new Date().toISOString();
  const device = getDeviceName();

  const trip: TripMeta = {
    kind: 'trip',
    id: 'trip',
    name: 'Europe 2026',
    destinations: 'Europe',
    startDate: '2026-08-06',
    endDate: '2026-09-06',
    homeCurrency: 'USD',
    tripCurrency: 'EUR',
    totalBudget: 0,
    notes: 'One month in Europe with the family.',
    updatedAt: now,
    updatedBy: device,
  };
  await db.trip.put(trip);

  const travelers: Traveler[] = [
    { kind: 'traveler', id: crypto.randomUUID(), name: 'Me',   role: 'adult', emoji: '🧑', updatedAt: now, updatedBy: device },
    { kind: 'traveler', id: crypto.randomUUID(), name: 'Wife', role: 'adult', emoji: '👩', updatedAt: now, updatedBy: device },
    { kind: 'traveler', id: crypto.randomUUID(), name: 'Son',  role: 'child', emoji: '🧒', updatedAt: now, updatedBy: device },
  ];
  await db.travelers.bulkPut(travelers);
}
