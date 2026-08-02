/**
 * Manual push-button sync.
 *
 * On sync we PUSH every local record to the relay and PULL the authoritative
 * set back, merging with last-write-wins (newer `updatedAt` wins). Deletes are
 * tombstones so they propagate too. Nothing runs automatically — only when the
 * user taps Sync.
 */
import { db, tableFor, getDeviceName } from './database';
import { scheduleBackup, deleteBackup, cancelScheduledBackup } from '../lib/persist';
import type { AnyRecord, EntityKind, ChatMessage } from '../types';
import {
  getSyncCode, getSyncPass, isSyncConfigured, setSyncCredentials, setLastSync,
  SYNC_ENDPOINT, BACKUP_ENDPOINT, PASSWORD_ENDPOINT,
} from '../lib/config';

const ENTITY_KINDS: EntityKind[] = [
  'traveler', 'document', 'checklist', 'transport',
  'accommodation', 'carrental', 'expense', 'itinerary', 'budget', 'budgetsheet', 'trip', 'photo', 'mappin', 'chatmsg', 'suggestion', 'fuelroute',
  'timelinestop', 'timelinelegend', 'activity',
];

interface RelayRecord {
  entity: EntityKind;
  record_id: string;
  updated_at: string;
  payload: AnyRecord;
}

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  message: string;
}

// High-watermark (this device's clock) of the last records we successfully
// pushed. On the next sync we only upload records changed since then, so an
// idle or lightly-edited app never re-uploads the whole database (incl. large
// photo/PDF attachments) every cycle. Safe because the relay is last-write-wins
// and already holds everything pushed earlier; re-pushing is only ever skipped
// for records the server already has.
const LAST_PUSH_KEY = 'trip.lastPushAt';

// Download cursor — the server-side `synced_at` high-watermark of records we've
// already pulled. Sent as `since` so the relay only returns rows synced after
// it, instead of the full record set (incl. big attachments) on every sync.
const CURSOR_KEY = 'trip.syncCursor';

async function collectLocal(since?: string): Promise<RelayRecord[]> {
  const out: RelayRecord[] = [];
  for (const kind of ENTITY_KINDS) {
    const table = tableFor(kind);
    // Every synced table indexes updatedAt, so the delta query is cheap and
    // avoids even loading unchanged blobs into memory.
    const rows = (since
      ? await table.where('updatedAt').aboveOrEqual(since).toArray()
      : await table.toArray()) as AnyRecord[];
    for (const r of rows) {
      out.push({ entity: kind, record_id: r.id, updated_at: r.updatedAt, payload: r });
    }
  }
  return out;
}

async function applyRemote(remote: RelayRecord[]): Promise<number> {
  let applied = 0;
  const newChat: ChatMessage[] = [];
  for (const rr of remote) {
    const table = tableFor(rr.entity);
    const local = (await table.get(rr.record_id)) as AnyRecord | undefined;
    // Last-write-wins: only apply if remote is strictly newer.
    if (!local || rr.updated_at > local.updatedAt) {
      await table.put(rr.payload);
      applied++;
      if (rr.entity === 'chatmsg' && !local) newChat.push(rr.payload as ChatMessage);
    }
  }
  if (applied) scheduleBackup(); // persist pulled-in changes to the device file too
  // Ping the family when a brand-new message arrives (fire-and-forget).
  if (newChat.length) import('../lib/chatUnread').then(m => m.notifyIncomingChat(newChat)).catch(() => {});
  return applied;
}

export async function syncNow(): Promise<SyncResult> {
  if (!isSyncConfigured()) {
    return { ok: false, pushed: 0, pulled: 0, message: 'Sync not set up yet. Add a trip code first.' };
  }

  // Only upload records changed since our last successful push (everything on
  // the very first push). Captured before collecting so edits made mid-sync are
  // caught next time.
  const pushMark = new Date().toISOString();
  const lastPush = localStorage.getItem(LAST_PUSH_KEY) || '';
  const local = await collectLocal(lastPush || undefined);
  const cursor = localStorage.getItem(CURSOR_KEY) || '';

  let res: Response;
  try {
    res = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripCode: getSyncCode(),
        password: getSyncPass(),
        device: getDeviceName(),
        records: local,
        // Delta download: only records synced after this come back. Omitted on
        // the first sync so we pull the full set once.
        ...(cursor ? { since: cursor } : {}),
      }),
    });
  } catch {
    return { ok: false, pushed: 0, pulled: 0, message: 'No connection. Try again when online.' };
  }

  if (res.status === 401) {
    return { ok: false, pushed: 0, pulled: 0, message: 'Wrong trip code or password.' };
  }
  if (!res.ok) {
    return { ok: false, pushed: 0, pulled: 0, message: 'Sync server error. Try again shortly.' };
  }

  const data = await res.json() as { records: RelayRecord[]; accepted: number; cursor?: string | null };
  const pulled = await applyRemote(data.records ?? []);

  // Push succeeded — advance the delta watermark so the next sync only sends
  // records changed after this point.
  localStorage.setItem(LAST_PUSH_KEY, pushMark);
  // Advance the download cursor only after the pulled records were applied, so
  // a crash mid-apply re-pulls them next time (the merge is idempotent).
  if (data.cursor) localStorage.setItem(CURSOR_KEY, data.cursor);

  // With auto-sync running after every change, throttle the immutable GitHub
  // backup so it happens at most every couple of minutes (not on every edit).
  const nowMs = Date.now();
  if (nowMs - lastGitHubBackup > 120_000) { lastGitHubBackup = nowMs; backupToGitHub(); }

  setLastSync(new Date().toISOString());
  // Note: we deliberately do NOT write a Change Log entry here — auto-sync runs
  // constantly, so a per-sync log line would flood the log (and re-dispatching
  // 'trip-data-changed' via logChange would loop auto-sync). The dashboard's
  // "last synced" time (setLastSync above) is the sync indicator instead.

  return {
    ok: true,
    pushed: data.accepted ?? local.length,
    pulled,
    message: pulled === 0 ? 'Everyone is up to date ✓' : `Pulled ${pulled} update${pulled === 1 ? '' : 's'} from other devices`,
  };
}

/** Force the next sync to push AND pull the full record set again (used when
 *  the trip code changes or local data is wiped, so nothing is missed). */
export function resetPushWatermark() {
  localStorage.removeItem(LAST_PUSH_KEY);
  localStorage.removeItem(CURSOR_KEY);
}

/**
 * Change the shared password for the current trip code. Authenticates with the
 * current password server-side, rotates the stored hash, and — on success —
 * saves the new password on this device so it keeps syncing. Other devices just
 * re-enter the new password once.
 */
export async function changePassword(currentPass: string, newPass: string): Promise<{ ok: boolean; message: string }> {
  const code = getSyncCode();
  if (!code) return { ok: false, message: 'Set a trip code first.' };
  if (newPass.length < 6) return { ok: false, message: 'New password must be at least 6 characters.' };
  if (newPass === currentPass) return { ok: false, message: 'New password is the same as the current one.' };

  let res: Response;
  try {
    res = await fetch(PASSWORD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripCode: code, password: currentPass, newPassword: newPass }),
    });
  } catch {
    return { ok: false, message: 'No connection. Try again when online.' };
  }

  if (res.status === 401) return { ok: false, message: 'Current password is wrong — enter the password this trip was set up with.' };
  if (res.status === 404) return { ok: false, message: 'No trip found with that code yet. Sync once first, then change the password.' };
  if (res.status === 429) return { ok: false, message: 'Too many attempts — wait a few minutes and try again.' };
  if (res.status === 400) {
    const d = await res.json().catch(() => ({} as { error?: string }));
    return { ok: false, message: d.error || 'Check the passwords and try again.' };
  }
  if (!res.ok) return { ok: false, message: 'Server error. Try again shortly.' };

  // Store the new password locally so this device keeps syncing seamlessly.
  setSyncCredentials(code, newPass);
  return { ok: true, message: 'Password changed ✓ Tell your family the new password so their devices update too.' };
}

// Throttle for the fire-and-forget GitHub backup triggered from syncNow.
let lastGitHubBackup = 0;

export interface BackupResult { ok: boolean; message: string; }

/**
 * Commit an immutable snapshot (records + photos) to GitHub via the backup
 * relay. Safe to call fire-and-forget: it swallows errors and returns a status
 * for the manual "Back up now" button in Settings.
 */
export async function backupToGitHub(): Promise<BackupResult> {
  if (!isSyncConfigured()) return { ok: false, message: 'Set a trip code first.' };
  try {
    const res = await fetch(BACKUP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripCode: getSyncCode(), password: getSyncPass() }),
    });
    if (res.status === 503) return { ok: false, message: 'GitHub backup isn’t switched on yet.' };
    if (res.status === 401) return { ok: false, message: 'Wrong trip code or password.' };
    if (res.status === 404) return { ok: false, message: 'Open the app while online so it can sync once, then back up.' };
    if (!res.ok) return { ok: false, message: 'Backup server error. Try again shortly.' };
    const d = await res.json() as { changed: boolean; records: number; newPhotos: number };
    return {
      ok: true,
      message: d.changed
        ? `Backed up to GitHub — ${d.records} records${d.newPhotos ? `, +${d.newPhotos} photos` : ''} ✓`
        : 'GitHub backup already up to date ✓',
    };
  } catch {
    return { ok: false, message: 'No connection for backup.' };
  }
}

/**
 * Read-only pull for the web portal. Authenticates with the trip code +
 * password and loads the authoritative record set into the local DB without
 * pushing anything back.
 */
export async function pullOnly(tripCode: string, password: string): Promise<SyncResult> {
  let res: Response;
  try {
    res = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripCode, password, readOnly: true }),
    });
  } catch {
    return { ok: false, pushed: 0, pulled: 0, message: 'No connection.' };
  }
  if (res.status === 401) return { ok: false, pushed: 0, pulled: 0, message: 'Wrong trip code or password.' };
  if (res.status === 404) return { ok: false, pushed: 0, pulled: 0, message: 'No trip found with that code yet. Open the app with the same trip code while online so it can sync first.' };
  if (!res.ok) return { ok: false, pushed: 0, pulled: 0, message: 'Portal server error.' };

  const data = await res.json() as { records: RelayRecord[] };
  const pulled = await applyRemote(data.records ?? []);
  return { ok: true, pushed: 0, pulled, message: `Loaded ${data.records?.length ?? 0} items` };
}

/** Wipe local data AND the on-device backup file. Used by "Clear data". */
export async function wipeLocal() {
  cancelScheduledBackup();
  resetPushWatermark();
  await Promise.all(ENTITY_KINDS.map(k => tableFor(k).clear()));
  await db.changelog.clear();
  await deleteBackup();
}
