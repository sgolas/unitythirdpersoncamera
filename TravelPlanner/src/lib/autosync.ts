/**
 * Auto-sync — replaces the manual Sync button. Any local change is pushed to
 * the relay shortly after it happens, and we pull periodically (and whenever
 * the app comes to the foreground) so other devices' changes arrive on their
 * own. A tiny status indicator (see SyncStatus) reflects the state.
 *
 * Loop-safe: syncNow() no longer writes to the Change Log, so applying pulled
 * records never re-triggers a sync.
 */
import { syncNow } from '../db/sync';
import { isSyncConfigured } from './config';
import { isNative, isPortal } from './platform';

export type SyncState = 'unconfigured' | 'syncing' | 'ok' | 'offline';

let state: SyncState = 'unconfigured';
let running = false;
let pending = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let started = false;

export function getSyncState(): SyncState { return state; }

function setState(s: SyncState, msg?: string) {
  state = s;
  window.dispatchEvent(new CustomEvent('sync-state', { detail: { state: s, msg } }));
}

/** Run a sync now (coalescing concurrent requests into one follow-up run). */
export async function runSync(): Promise<void> {
  if (!isSyncConfigured()) { setState('unconfigured'); return; }
  if (running) { pending = true; return; }
  running = true;
  setState('syncing');
  let ok = false;
  try {
    const res = await syncNow();
    ok = res.ok;
    // A 401/"wrong code" or config problem shouldn't spin forever as "syncing".
    setState(ok ? 'ok' : 'offline', res.message);
  } catch {
    setState('offline');
  } finally {
    running = false;
    if (pending) { pending = false; void runSync(); }
  }
}

/** Debounced push after an edit — coalesces rapid changes into one sync. */
function scheduleSoon() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { void runSync(); }, 1200);
}

export function initAutoSync() {
  if (isPortal || started) return;
  started = true;

  // Push shortly after any local change.
  window.addEventListener('trip-data-changed', scheduleSoon);
  // Sync as soon as sharing is configured.
  window.addEventListener('sync-config-changed', () => { void runSync(); });
  // Pull periodically while the app is visible, to receive others' changes.
  setInterval(() => { if (document.visibilityState === 'visible') void runSync(); }, 20_000);
  // Sync when the app/tab regains focus.
  window.addEventListener('focus', () => { void runSync(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void runSync(); });
  if (isNative) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', s => { if (s.isActive) void runSync(); });
    }).catch(() => { /* plugin unavailable */ });
  }

  // Initial sync once things have settled.
  setTimeout(() => { void runSync(); }, 1500);
}
