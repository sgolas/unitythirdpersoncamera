import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PortalApp } from './portal/PortalApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { isPortal, isNative } from './lib/platform';
import { initOTA } from './lib/ota';
import { initTheme } from './lib/theme';
import { restoreIfEmpty, scheduleBackup, saveBackup } from './lib/persist';

// Apply the saved theme immediately to avoid a flash of the wrong mode.
initTheme();

async function initNativeChrome() {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Dark header → light status-bar icons; let our header paint behind it.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch { /* plugin unavailable in web preview */ }
}

/**
 * When a form field is focused (keyboard opens), make sure it scrolls into
 * view so it isn't hidden behind the keyboard — works on web and native.
 */
function initFocusScroll() {
  // If the focused field is hidden behind the on-screen keyboard, scroll it
  // up into the visible area. Uses the visual viewport (which shrinks for the
  // keyboard) so we only scroll when a field is actually covered.
  function ensureVisible() {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    const vv = window.visualViewport;
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const r = el.getBoundingClientRect();
    if (r.bottom > visibleBottom - 16 || r.top < 8) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  window.addEventListener('focusin', e => {
    const el = e.target as HTMLElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) setTimeout(ensureVisible, 300);
  });
  window.visualViewport?.addEventListener('resize', () => setTimeout(ensureVisible, 100));
}

/**
 * The web view no longer resizes for the keyboard (see capacitor.config), so
 * it always fills the screen. We publish the keyboard height as a --kb CSS
 * variable; the Sheet lifts above the keyboard while it's open and drops back
 * to full-screen the instant it hides.
 */
function initKeyboardVar() {
  const root = document.documentElement;
  const set = (px: number) => root.style.setProperty('--kb', `${Math.max(0, Math.round(px))}px`);
  set(0);
  if (!isNative) return;
  import('@capacitor/keyboard').then(({ Keyboard, KeyboardResize }) => {
    // Force resize:none at runtime so it also applies to already-installed
    // APKs via OTA (the config value is only baked into fresh builds).
    Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
    Keyboard.addListener('keyboardWillShow', info => set(info.keyboardHeight));
    Keyboard.addListener('keyboardWillHide', () => set(0));
  }).catch(() => { /* plugin unavailable */ });
}

async function boot() {
  await initNativeChrome();
  initFocusScroll();
  initKeyboardVar();

  // Survive uninstall: if this is a fresh install with an empty database,
  // restore from the backup file kept in the phone's Documents folder.
  if (!isPortal) {
    await restoreIfEmpty();
    // Re-save the on-device backup whenever data changes (debounced), and
    // flush immediately when the app goes to the background.
    window.addEventListener('trip-data-changed', scheduleBackup);
    // On a fresh install, treat any chat history pulled on first sync as already
    // seen (so joining a trip doesn't blast old-message notifications/badges).
    import('./lib/chatUnread').then(({ initChatWatermarks }) => initChatWatermarks()).catch(() => {});
    // Auto-sync: push local changes to the family relay after every edit and
    // pull others' changes periodically (replaces the manual Sync button).
    import('./lib/autosync').then(({ initAutoSync }) => initAutoSync()).catch(() => {});
    // Trip-day reminders (flight check-ins, leave-for-airport, activities).
    import('./lib/notify').then(({ initTripReminders }) => initTripReminders()).catch(() => {});
    // Push notifications for incoming family chat (native only; no-ops otherwise).
    if (isNative) import('./lib/push').then(({ initPush }) => initPush()).catch(() => {});
    if (isNative) {
      import('@capacitor/app').then(({ App: CapApp }) => {
        CapApp.addListener('appStateChange', s => { if (!s.isActive) void saveBackup(); });
      }).catch(() => {});
    }
  }

  // No pre-seeded trip: a brand-new editor install shows the first-run
  // onboarding wizard (see App.tsx) so each user creates their own trip.
  // The read-only portal never seeds — it shows data pulled from sync.

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        {isPortal ? <PortalApp /> : <App />}
      </ErrorBoundary>
    </React.StrictMode>,
  );

  // Keep the app in portrait by default (the manifest no longer pins it, so the
  // game can go landscape). Fire-and-forget AFTER render — never awaited — so a
  // slow/hanging orientation call can't block the app from painting.
  if (isNative) { import('./lib/orientation').then(({ lockPortrait }) => lockPortrait()).catch(() => {}); }

  // Check for an OTA update in the background after the app has rendered.
  initOTA();
}

boot();
