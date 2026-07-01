/**
 * Over-the-air (OTA) updates — self-managed.
 *
 * On each launch the native app fetches a small manifest (latest.json) that
 * says which web bundle is current. If it's newer than what's running, it
 * downloads the bundle in the background and activates it on the next app
 * restart — so the app silently stays up to date without reinstalling the APK.
 *
 * Everything is hosted on the existing Supabase storage; no extra service.
 * Failures never block startup, and Capgo auto-rolls-back if a bundle is bad.
 */
import { isNative } from './platform';

const MANIFEST_URL =
  'https://zyqnaldaaqqdhnbqitjn.supabase.co/storage/v1/object/public/downloads/latest.json';
const PENDING_KEY = 'ota.pendingVersion';

export async function initOTA(): Promise<void> {
  if (!isNative) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

    // Tell Capgo the running bundle loaded fine (prevents auto-rollback).
    await CapacitorUpdater.notifyAppReady();

    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = await res.json() as { version?: string; url?: string };
    if (!manifest.version || !manifest.url) return;

    const current = await CapacitorUpdater.current();
    const running = current?.bundle?.version ?? '';
    if (manifest.version === running) return; // already up to date

    // Don't re-download a version we already fetched and queued.
    if (localStorage.getItem(PENDING_KEY) === manifest.version) {
      const existing = (await CapacitorUpdater.list()).bundles
        .find(b => b.version === manifest.version);
      if (existing) { await CapacitorUpdater.next({ id: existing.id }); return; }
    }

    const bundle = await CapacitorUpdater.download({ url: manifest.url, version: manifest.version });
    // Activate on the next app restart/background — silent, non-disruptive.
    await CapacitorUpdater.next({ id: bundle.id });
    localStorage.setItem(PENDING_KEY, manifest.version);
  } catch (err) {
    // OTA is best-effort; never break the app over it.
    console.warn('OTA check failed:', err);
  }
}
