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

/** Random token from an unambiguous alphabet (no 0/O/1/l/I). */
function token(len: number): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

/**
 * Ensure this trip has a sync code + password so it can sync and be shared —
 * generated automatically so the user never has to invent one. Existing
 * credentials are left untouched.
 */
export function ensureSyncCredentials(): { code: string; pass: string } {
  let code = getSyncCode();
  let pass = getSyncPass();
  if (!code || !pass) {
    code = 'trip-' + token(6) + '-' + token(4);
    pass = token(14);
    setSyncCredentials(code, pass);
  }
  return { code, pass };
}

/** Public URL family members open to view the trip (read-only portal). */
export const PORTAL_BASE = 'https://trip.sgolas.com';

/** A tap-to-open invite link that signs the viewer straight into the portal. */
export function buildInviteLink(code: string, pass: string): string {
  return `${PORTAL_BASE}/#t=${encodeURIComponent(code)}&k=${encodeURIComponent(pass)}`;
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
export const PLACES_ENDPOINT = isNative ? `${NATIVE_SYNC_BASE}/api/places` : '/api/places';
