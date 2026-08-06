/**
 * Over-the-air (OTA) updates — self-managed, with visible status for
 * diagnostics.
 *
 * On launch the native app fetches latest.json; if a newer web bundle exists
 * it downloads it and applies it immediately (set()) which reloads into the
 * new version. Status is written to localStorage so the Settings screen can
 * show exactly what happened.
 */
import { isNative } from './platform';

const MANIFEST_URL =
  'https://zyqnaldaaqqdhnbqitjn.supabase.co/storage/v1/object/public/downloads/latest.json';
const STATUS_KEY = 'ota.status';

export function getOtaStatus(): string {
  return localStorage.getItem(STATUS_KEY) || 'not checked yet';
}
function setStatus(s: string) { localStorage.setItem(STATUS_KEY, s); }

/** Run on launch (silent). */
export async function initOTA(): Promise<void> {
  await runOTA();
}

/** Check + apply an update. Called on launch and from the Settings button. */
export async function runOTA(): Promise<string> {
  if (!isNative) { setStatus('Running in the browser — OTA only applies to the installed app.'); return getOtaStatus(); }
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();

    const cur = await CapacitorUpdater.current();
    const running = cur?.bundle?.version ?? 'builtin';

    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) { setStatus(`Couldn't reach update server (HTTP ${res.status}). Current: ${running}`); return getOtaStatus(); }
    const m = await res.json() as { version?: string; url?: string };
    if (!m.version || !m.url) { setStatus(`Update info invalid. Current: ${running}`); return getOtaStatus(); }

    if (m.version === running) { setStatus(`Up to date ✓ (${running})`); return getOtaStatus(); }

    setStatus(`Downloading update ${m.version}…`);
    const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version });
    setStatus(`Applying update ${m.version}…`);
    // set() reloads the app into the new bundle immediately.
    await CapacitorUpdater.set({ id: bundle.id });
    return getOtaStatus();
  } catch (err) {
    setStatus('Update error: ' + (err instanceof Error ? err.message : String(err)));
    return getOtaStatus();
  }
}
