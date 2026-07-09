/**
 * Manual push-button sync.
 *
 * On sync we PUSH every local record to the relay and PULL the authoritative
 * set back, merging with last-write-wins (newer `updatedAt` wins). Deletes are
 * tombstones so they propagate too. Nothing runs automatically — only when the
 * user taps Sync.
 */
import { db, tableFor, getDeviceName, logChange } from './database';
import { scheduleBackup, deleteBackup, cancelScheduledBackup } from '../lib/persist';
import type { AnyRecord, EntityKind, ChatMessage } from '../types';
import {
  getSyncCode, getSyncPass, isSyncConfigured, setLastSync, SYNC_ENDPOINT, BACKUP_ENDPOINT,
} from '../lib/config';

const ENTITY_KINDS: EntityKind[] = [
  'traveler', 'document', 'checklist', 'transport',
  'accommodation', 'carrental', 'expense', 'itinerary', 'budget', 'trip', 'photo', 'mappin', 'chatmsg',
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

async function collectLocal(): Promise<RelayRecord[]> {
  const out: RelayRecord[] = [];
  for (const kind of ENTITY_KINDS) {
    const rows = (await tableFor(kind).toArray()) as AnyRecord[];
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

  const local = await collectLocal();

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

  const data = await res.json() as { records: RelayRecord[]; accepted: number };
  const pulled = await applyRemote(data.records ?? []);

  // Fire-and-forget an immutable GitHub backup. Never blocks or fails the sync.
  backupToGitHub();

  const now = new Date().toISOString();
  setLastSync(now);
  await logChange({
    action: 'sync',
    entity: 'trip',
    recordId: 'sync',
    summary: `Synced with other devices — sent ${data.accepted ?? local.length}, received ${pulled} update${pulled === 1 ? '' : 's'}`,
  });

  return {
    ok: true,
    pushed: data.accepted ?? local.length,
    pulled,
    message: pulled === 0 ? 'Everyone is up to date ✓' : `Pulled ${pulled} update${pulled === 1 ? '' : 's'} from other devices`,
  };
}

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
    if (res.status === 404) return { ok: false, message: 'Tap Sync once before backing up.' };
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
  if (res.status === 404) return { ok: false, pushed: 0, pulled: 0, message: 'No trip found with that code yet. Open the app, use the same trip code in Sync & Setup, and tap Sync first.' };
  if (!res.ok) return { ok: false, pushed: 0, pulled: 0, message: 'Portal server error.' };

  const data = await res.json() as { records: RelayRecord[] };
  const pulled = await applyRemote(data.records ?? []);
  return { ok: true, pushed: 0, pulled, message: `Loaded ${data.records?.length ?? 0} items` };
}

/** Wipe local data AND the on-device backup file. Used by "Clear data". */
export async function wipeLocal() {
  cancelScheduledBackup();
  await Promise.all(ENTITY_KINDS.map(k => tableFor(k).clear()));
  await db.changelog.clear();
  await deleteBackup();
}
