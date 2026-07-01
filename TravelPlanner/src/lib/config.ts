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

// Sync relay endpoint (Netlify function). Same origin in production.
export const SYNC_ENDPOINT = '/.netlify/functions/sync';
