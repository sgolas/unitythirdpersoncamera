/**
 * On-device persistence that survives an app uninstall.
 *
 * Android wipes an app's PRIVATE storage (our IndexedDB) when the app is
 * uninstalled. To keep the trip anyway, we mirror everything to a plain JSON
 * file in the phone's shared **Documents** folder (Documents/TripPlanner/),
 * which lives outside the app sandbox and survives uninstall. On a fresh
 * launch with an empty database we read that file back and restore it. The
 * in-app "Clear data" button deletes this file too — so that is the only
 * thing that truly erases the trip.
 */
import { isNative } from './platform';
import { db } from '../db/database';

const TABLES = [
  'travelers', 'documents', 'checklist', 'transport', 'accommodation',
  'expenses', 'itinerary', 'budget', 'trip', 'photos', 'changelog',
] as const;

const FILE = 'TripPlanner/trip-backup.json';

// Volatile caches that regenerate on their own — no need to back these up.
const skipKey = (k: string) => k.startsWith('wx:') || k.startsWith('geo:') || k.startsWith('ota.');

async function snapshot(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (!skipKey(k)) ls[k] = localStorage.getItem(k)!;
  }
  return JSON.stringify({ v: 1, at: new Date().toISOString(), data, ls });
}

/** Write the full backup to Documents/TripPlanner/. Safe/no-op on web. */
export async function saveBackup(): Promise<void> {
  if (!isNative) return;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const json = await snapshot();
    await Filesystem.mkdir({ path: 'TripPlanner', directory: Directory.Documents, recursive: true }).catch(() => {});
    await Filesystem.writeFile({ path: FILE, directory: Directory.Documents, data: json, encoding: Encoding.UTF8 });
  } catch { /* plugin missing on an older APK, or storage unavailable */ }
}

/** Read the backup file and load it into the database + settings. */
async function doRestore(): Promise<boolean> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const res = await Filesystem.readFile({ path: FILE, directory: Directory.Documents, encoding: Encoding.UTF8 });
  const parsed = JSON.parse(res.data as string) as { data?: Record<string, unknown[]>; ls?: Record<string, string> };
  for (const t of TABLES) {
    const rows = parsed.data?.[t];
    if (Array.isArray(rows) && rows.length) await db.table(t).bulkPut(rows as any[]);
  }
  if (parsed.ls) for (const [k, v] of Object.entries(parsed.ls)) localStorage.setItem(k, v);
  return true;
}

/** On a fresh (empty) install, restore from the Documents backup. */
export async function restoreIfEmpty(): Promise<boolean> {
  if (!isNative) return false;
  try {
    if (await db.trip.get('trip')) return false; // already have data
    return await doRestore();
  } catch { return false; }
}

/** Manual recovery from Settings — restore even if some data already exists. */
export async function restoreFromFile(): Promise<boolean> {
  if (!isNative) return false;
  try { return await doRestore(); } catch { return false; }
}

/** Delete the on-device backup file (used by "Clear data"). */
export async function deleteBackup(): Promise<void> {
  if (!isNative) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: FILE, directory: Directory.Documents });
  } catch { /* already gone */ }
}

/** True once a backup file exists — for showing status in Settings. */
export async function backupExists(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.stat({ path: FILE, directory: Directory.Documents });
    return true;
  } catch { return false; }
}

// Debounced auto-save so rapid edits collapse into one write.
let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleBackup(): void {
  if (!isNative) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void saveBackup(); }, 2500);
}
export function cancelScheduledBackup(): void { clearTimeout(timer); }
