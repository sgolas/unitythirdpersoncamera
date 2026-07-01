/**
 * Manual push-button sync.
 *
 * On sync we PUSH every local record to the relay and PULL the authoritative
 * set back, merging with last-write-wins (newer `updatedAt` wins). Deletes are
 * tombstones so they propagate too. Nothing runs automatically — only when the
 * user taps Sync.
 */
import { db, tableFor, getDeviceName, logChange } from './database';
import type { AnyRecord, EntityKind } from '../types';
import {
  getSyncCode, getSyncPass, isSyncConfigured, setLastSync, SYNC_ENDPOINT,
} from '../lib/config';

const ENTITY_KINDS: EntityKind[] = [
  'traveler', 'document', 'checklist', 'transport',
  'accommodation', 'expense', 'itinerary', 'budget', 'trip',
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
  for (const rr of remote) {
    const table = tableFor(rr.entity);
    const local = (await table.get(rr.record_id)) as AnyRecord | undefined;
    // Last-write-wins: only apply if remote is strictly newer.
    if (!local || rr.updated_at > local.updatedAt) {
      await table.put(rr.payload);
      applied++;
    }
  }
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

/** Wipe local data (keeps device name). Used by "reset" in settings. */
export async function wipeLocal() {
  await Promise.all(ENTITY_KINDS.map(k => tableFor(k).clear()));
  await db.changelog.clear();
}
