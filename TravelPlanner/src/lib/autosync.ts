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

// 'error' = a problem the user must fix (wrong trip code / password); distinct
// from 'offline' (transient network) so the indicator can tell them apart.
export type SyncState = 'unconfigured' | 'syncing' | 'ok' | 'offline' | 'error';

let state: SyncState = 'unconfigured';
let lastMessage = '';
let running = false;
let pending = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export function getSyncState(): SyncState { return state; }
export function getSyncMessage(): string { return lastMessage; }

function setState(s: SyncState, msg = '') {
  state = s;
  lastMessage = msg;
  window.dispatchEvent(new CustomEvent('sync-state', { detail: { state: s, msg } }));
}

/** A failure message that means the user must fix something (not just network). */
function isConfigError(msg: string): boolean {
  return /wrong trip code|not set up/i.test(msg);
}

/** Run a sync now (coalescing concurrent requests into one follow-up run). */
export async function runSync(): Promise<void> {
  if (!isSyncConfigured()) { setState('unconfigured'); return; }
  if (running) { pending = true; return; }
  running = true;
  setState('syncing');
  try {
    const res = await syncNow();
    if (res.ok) setState('ok', res.message);
    else setState(isConfigError(res.message) ? 'error' : 'offline', res.message);
  } catch {
    setState('offline', 'No connection.');
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

/** Debounced foreground wake — focus, visibility and appState events on the
 *  same transition collapse into a single sync instead of 2-3. */
function wake() {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => { void runSync(); }, 400);
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
  // Sync when the app/tab regains foreground (all three collapse via wake()).
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  if (isNative) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', s => { if (s.isActive) wake(); });
    }).catch(() => { /* plugin unavailable */ });
  }

  // Initial sync once things have settled.
  setTimeout(() => { void runSync(); }, 1500);
}
