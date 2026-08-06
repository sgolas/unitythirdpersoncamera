/**
 * "Who am I on this trip" — a per-device identity that ties the person using
 * this device to one of the shared travellers. Stored locally (like the device
 * name), so it never syncs; each device picks its own. Used so approvals and
 * other per-person actions can be attributed to a specific traveller instead of
 * the honour-system "anyone can tap anyone".
 */
import { useEffect, useState } from 'react';

const ME_KEY = 'trip.meTravelerId';
const EVENT = 'trip-me-changed';

export function getMeId(): string | null {
  return localStorage.getItem(ME_KEY) || null;
}

export function setMeId(id: string | null): void {
  if (id) localStorage.setItem(ME_KEY, id);
  else localStorage.removeItem(ME_KEY);
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* SSR */ }
}

/** Reactive current-traveller id; updates when the identity changes. */
export function useMeId(): string | null {
  const [id, setId] = useState<string | null>(getMeId());
  useEffect(() => {
    const h = () => setId(getMeId());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return id;
}
