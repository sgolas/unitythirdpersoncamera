/**
 * Screen-orientation control for the artillery game.
 *
 * The app is pinned to portrait in the Android manifest, so the game locks to
 * landscape at the native level via @capacitor/screen-orientation (its runtime
 * setRequestedOrientation overrides the manifest per-screen). On the web (and
 * on older APKs without the plugin) we fall back to the Web Screen Orientation
 * API, which needs the page to be fullscreen first. Everything is best-effort.
 */
import { isNative } from './platform';

type AnyOrientation = { lock?: (o: string) => Promise<void>; unlock?: () => void } | undefined;

async function nativePlugin() {
  if (!isNative) return null;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isPluginAvailable('ScreenOrientation')) return null; // older APK
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    return ScreenOrientation;
  } catch { return null; }
}

/** Lock to landscape while the game is on screen. */
export async function lockLandscape(el?: Element | null): Promise<void> {
  const native = await nativePlugin();
  if (native) { try { await native.lock({ orientation: 'landscape' }); return; } catch { /* fall through */ } }

  // Web fallback: lock via the Screen Orientation API (requires fullscreen).
  const so = (screen as unknown as { orientation?: AnyOrientation }).orientation;
  if (so?.lock) {
    try { await so.lock('landscape'); return; } catch { /* needs fullscreen */ }
  }
  const target = (el || document.documentElement) as any;
  if (!document.fullscreenElement && target?.requestFullscreen) {
    try { await target.requestFullscreen(); } catch { /* denied */ }
  } else if (!document.fullscreenElement && target?.webkitRequestFullscreen) {
    try { target.webkitRequestFullscreen(); } catch { /* denied */ }
  }
  try { await so?.lock?.('landscape'); } catch { /* unsupported */ }
}

/** Pin the app to portrait (its default everywhere except the game). Called at
 *  startup and when leaving the game — the manifest no longer forces portrait,
 *  so the plugin is the single source of truth. */
export async function lockPortrait(): Promise<void> {
  const native = await nativePlugin();
  if (native) { try { await native.lock({ orientation: 'portrait' }); } catch { /* ignore */ } return; }
  try {
    const so = (screen as unknown as { orientation?: AnyOrientation }).orientation;
    await so?.lock?.('portrait');
  } catch { /* unsupported */ }
}

/** Return to the app's normal portrait orientation when leaving the game. */
export async function unlockOrientation(): Promise<void> {
  await lockPortrait();
}
