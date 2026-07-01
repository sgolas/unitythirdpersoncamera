import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PortalApp } from './portal/PortalApp';
import './index.css';
import { isPortal, isNative } from './lib/platform';
import { seedIfEmpty } from './db/seed';

async function initNativeChrome() {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Dark header → light status-bar icons; let our header paint behind it.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch { /* plugin unavailable in web preview */ }
}

async function boot() {
  await initNativeChrome();

  // The editor (native app) seeds a starter trip; the read-only portal never
  // seeds — it only shows data pulled from the family's synced trip.
  if (!isPortal) await seedIfEmpty();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {isPortal ? <PortalApp /> : <App />}
    </React.StrictMode>,
  );
}

boot();
