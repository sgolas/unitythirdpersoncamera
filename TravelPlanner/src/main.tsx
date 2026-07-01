import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PortalApp } from './portal/PortalApp';
import './index.css';
import { isPortal, isNative } from './lib/platform';
import { seedIfEmpty } from './db/seed';
import { initOTA } from './lib/ota';

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

async function boot() {
  await initNativeChrome();
  initFocusScroll();

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
