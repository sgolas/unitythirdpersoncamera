import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PortalApp } from './portal/PortalApp';
import './index.css';
import { isPortal } from './lib/platform';
import { seedIfEmpty } from './db/seed';

async function boot() {
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
