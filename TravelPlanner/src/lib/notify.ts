/**
 * Trip-day reminders — local notifications scheduled on the device, so they
 * fire even with the app closed and nothing ever leaves the phone.
 *
 *   ✈️ flights:  check-in nudge 24h before departure + "head to the airport"
 *                3h before (when a departure time is set)
 *   🏨 stays:    a check-in reminder at 9:00 on arrival day
 *   📍 events:   1h before anything with a start time
 *
 * Requires the @capacitor/local-notifications plugin (APK 1.4+). Everything
 * is re-scheduled from scratch whenever trip data changes, so edits and
 * synced updates are always reflected. Toggle lives in Settings.
 */
import { db, activeRows } from '../db/database';
import type { Transport, Accommodation, ItineraryEvent } from '../types';
import { isNative } from './platform';

const PREF_KEY = 'trip.reminders'; // '1' = on (default), '0' = off

export function remindersEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) !== '0';
}
export function setRemindersEnabled(on: boolean) {
  localStorage.setItem(PREF_KEY, on ? '1' : '0');
  if (on) scheduleTripNotifications(); else cancelAll();
}

/** Stable 31-bit id per record + slot, so re-scheduling replaces cleanly. */
function nid(recordId: string, slot: number): number {
  let h = slot;
  for (let i = 0; i < recordId.length; i++) h = ((h * 31) + recordId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000 + 1;
}

const at = (date: string, time: string) => new Date(`${date}T${time}:00`);

async function plugin() {
  if (!isNative) return null;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isPluginAvailable('LocalNotifications')) return null; // older APK
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch { return null; }
}

async function cancelAll() {
  const LN = await plugin();
  if (!LN) return;
  try {
    const pending = await LN.getPending();
    if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  } catch { /* nothing scheduled */ }
}

/** Ask for permission (Android 13+ shows a system dialog). True if granted. */
export async function ensureNotifyPermission(): Promise<boolean> {
  const LN = await plugin();
  if (!LN) return false;
  let s = await LN.checkPermissions();
  if (s.display !== 'granted') s = await LN.requestPermissions();
  return s.display === 'granted';
}

/** One-off, immediate notification (used for live flight-status changes). */
export async function notifyNow(title: string, body: string, id = Date.now() % 2_000_000_000) {
  const LN = await plugin();
  if (!LN || !remindersEnabled()) return;
  try {
    await LN.schedule({ notifications: [{ id, title, body, schedule: { at: new Date(Date.now() + 1000) } }] });
  } catch { /* permission missing */ }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced full re-schedule — call whenever trip data may have changed. */
export function scheduleTripNotificationsSoon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { scheduleTripNotifications(); }, 4000);
}

export async function scheduleTripNotifications(): Promise<number> {
  const LN = await plugin();
  if (!LN || !remindersEnabled()) return 0;
  if (!(await ensureNotifyPermission())) return 0;

  const now = Date.now();
  const horizon = now + 60 * 24 * 3600_000; // schedule the next 60 days
  const list: { id: number; title: string; body: string; schedule: { at: Date } }[] = [];
  const add = (id: number, title: string, body: string, when: Date) => {
    if (when.getTime() > now + 60_000 && when.getTime() < horizon) list.push({ id, title, body, schedule: { at: when } });
  };

  const transport = activeRows<Transport>(await db.transport.toArray());
  for (const t of transport) {
    if (!t.departDate) continue;
    const dep = at(t.departDate, t.departTime || '09:00');
    const what = `${t.fromPlace} → ${t.toPlace}${t.flightNumber ? ` (${t.flightNumber})` : ''}`;
    if (t.mode === 'flight') {
      add(nid(t.id, 1), '✈️ Check in for your flight', `${what} departs tomorrow at ${t.departTime || 'TBD'}.`,
        new Date(dep.getTime() - 24 * 3600_000));
      if (t.departTime) {
        add(nid(t.id, 2), '🧳 Time to head to the airport', `${what} departs at ${t.departTime}.`,
          new Date(dep.getTime() - 3 * 3600_000));
      }
    } else if (t.departTime) {
      add(nid(t.id, 2), `🚉 ${t.mode.charAt(0).toUpperCase() + t.mode.slice(1)} today`, `${what} leaves at ${t.departTime}.`,
        new Date(dep.getTime() - 90 * 60_000));
    }
  }

  const stays = activeRows<Accommodation>(await db.accommodation.toArray());
  for (const s of stays) {
    if (!s.checkIn) continue;
    add(nid(s.id, 3), '🏨 Check-in today', `${s.name}${s.city ? `, ${s.city}` : ''}${s.confirmation ? ` · Conf: ${s.confirmation}` : ''}`,
      at(s.checkIn, '09:00'));
  }

  const events = activeRows<ItineraryEvent>(await db.itinerary.toArray());
  for (const e of events) {
    if (!e.date || !e.startTime) continue;
    add(nid(e.id, 4), `📍 Coming up: ${e.title}`, `${e.startTime}${e.place ? ` · ${e.place}` : ''}`,
      new Date(at(e.date, e.startTime).getTime() - 60 * 60_000));
  }

  await cancelAll();
  if (list.length) await LN.schedule({ notifications: list });
  return list.length;
}

/** Wire up: reschedule on any data change, and once on startup. */
export function initTripReminders() {
  if (!isNative) return;
  window.addEventListener('trip-data-changed', scheduleTripNotificationsSoon);
  setTimeout(() => { scheduleTripNotifications(); }, 3000);
}
