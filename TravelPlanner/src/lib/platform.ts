/**
 * Runtime mode.
 *
 * - Native (Capacitor / Android app)  → full editor.
 * - Web build                         → read-only portal (view-only).
 *
 * `?app=1` forces editor mode in a browser, handy for previews/testing.
 */
const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
export const isNative = !!cap?.isNativePlatform?.();

/** True in the Electron desktop companion app (a full editor, like native). */
export const isDesktop = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);

const forceApp = new URLSearchParams(location.search).has('app');

/** True when running as the sgolas.com view-only web portal. */
export const isPortal = !isNative && !isDesktop && !forceApp;

/** Writes are disabled in portal mode. */
export const readOnly = isPortal;
