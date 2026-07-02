import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PortalApp } from './portal/PortalApp';
import './index.css';
import { isPortal, isNative } from './lib/platform';
import { seedIfEmpty } from './db/seed';
import { initOTA } from './lib/ota';
import { initTheme } from './lib/theme';

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
  window.addEventListener('focusin', e => {
    const el = e.target as HTMLElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      // 'nearest' only scrolls when the field is actually off-screen, and
      // scrolls the minimum amount — so it never yanks the header away.
      setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
    }
  });
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

  // The editor (native app) seeds a starter trip; the read-only portal never
  // seeds — it only shows data pulled from the family's synced trip.
  if (!isPortal) await seedIfEmpty();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {isPortal ? <PortalApp /> : <App />}
    </React.StrictMode>,
  );

  // Check for an OTA update in the background after the app has rendered.
  initOTA();
}

boot();
