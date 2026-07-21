/**
 * Screen-orientation lock for the artillery game.
 *
 * There's no native @capacitor/screen-orientation plugin in the build, so we
 * use the Web Screen Orientation API — which reaches installed apps over OTA.
 * Chromium (and the Android WebView) only allow `orientation.lock()` while the
 * page is in the Fullscreen API, so we enter fullscreen on the game element
 * first, then lock to landscape. Everything is best-effort: on platforms that
 * don't support it (desktop, iOS Safari) the calls just no-op.
 */

type AnyOrientation = { lock?: (o: string) => Promise<void>; unlock?: () => void } | undefined;

export async function lockLandscape(el?: Element | null): Promise<void> {
  const so = (screen as unknown as { orientation?: AnyOrientation }).orientation;
  // Fast path: some platforms allow locking without fullscreen.
  if (so?.lock) {
    try { await so.lock('landscape'); return; } catch { /* needs fullscreen */ }
  }
  // Enter fullscreen on the game element, then retry the lock.
  const target = (el || document.documentElement) as any;
  if (!document.fullscreenElement && target?.requestFullscreen) {
    try { await target.requestFullscreen(); } catch { /* denied */ }
  } else if (!document.fullscreenElement && target?.webkitRequestFullscreen) {
    try { target.webkitRequestFullscreen(); } catch { /* denied */ }
  }
  try { await so?.lock?.('landscape'); } catch { /* unsupported */ }
}

export function unlockOrientation(): void {
  try {
    const so = (screen as unknown as { orientation?: AnyOrientation }).orientation;
    so?.unlock?.();
  } catch { /* unsupported */ }
}
