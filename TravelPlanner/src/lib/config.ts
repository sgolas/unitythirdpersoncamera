/**
 * Sync configuration, stored locally. The "trip code" + password is the
 * shared secret that ties a family's devices together and gates the
 * read-only web portal. Nothing syncs until the user sets these.
 */
const CODE_KEY = 'trip.syncCode';
const PASS_KEY = 'trip.syncPass';
const LAST_KEY = 'trip.lastSync';

export function getSyncCode(): string { return localStorage.getItem(CODE_KEY) ?? ''; }
export function getSyncPass(): string { return localStorage.getItem(PASS_KEY) ?? ''; }
export function isSyncConfigured(): boolean { return !!getSyncCode() && !!getSyncPass(); }

export function setSyncCredentials(code: string, pass: string) {
  localStorage.setItem(CODE_KEY, code.trim());
  localStorage.setItem(PASS_KEY, pass);
}

export function getLastSync(): string | null { return localStorage.getItem(LAST_KEY); }
export function setLastSync(iso: string) { localStorage.setItem(LAST_KEY, iso); }

import { isNative } from './platform';

// Where the sync relay lives (Cloudflare Pages Function at /api/sync).
// - Web portal is served from the same origin, so a relative path works.
// - The native Android app has no server origin, so it needs the absolute
//   deployed URL. Update this to the live Cloudflare domain after first deploy.
const NATIVE_SYNC_BASE = 'https://trip-planner-sgolas.pages.dev';
export const SYNC_ENDPOINT = isNative ? `${NATIVE_SYNC_BASE}/api/sync` : '/api/sync';
export const PHOTO_ENDPOINT = isNative ? `${NATIVE_SYNC_BASE}/api/photo` : '/api/photo';
export const BACKUP_ENDPOINT = isNative ? `${NATIVE_SYNC_BASE}/api/backup` : '/api/backup';
