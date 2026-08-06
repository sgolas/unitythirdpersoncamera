import { useEffect, useState } from 'react';
import { getSyncState, getSyncMessage, runSync, type SyncState } from '../lib/autosync';

/**
 * A tiny status light for sync (replaces the old text pill):
 *   🟢 green  — synced / up to date
 *   🔵 blue   flashing — syncing right now
 *   🔴 red    flashing — a problem to fix (wrong trip code/password) → tap
 *   🟠 amber  flashing — offline; it'll catch up when back online
 *   ⚪ grey   — sync not set up yet → tap to set up
 * Tapping fixes/sets up sync when needed, or forces a sync otherwise.
 */
const LIGHTS: Record<SyncState, { color: string; flash: boolean; label: string }> = {
  ok:           { color: '#22c55e', flash: false, label: 'Synced — up to date' },
  syncing:      { color: '#3b82f6', flash: true,  label: 'Syncing…' },
  error:        { color: '#ef4444', flash: true,  label: 'Sync problem — tap to fix' },
  offline:      { color: '#f59e0b', flash: true,  label: 'Offline — will sync when back online' },
  unconfigured: { color: '#94a3b8', flash: false, label: 'Tap to set up sync' },
};

export function SyncStatus({ onSetup }: { onSetup?: () => void }) {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent).detail.state as SyncState);
    window.addEventListener('sync-state', on);
    return () => window.removeEventListener('sync-state', on);
  }, []);

  function onTap() {
    if (state === 'unconfigured' || state === 'error') onSetup?.();
    else void runSync();
  }

  const cfg = LIGHTS[state];
  return (
    <button onClick={onTap} aria-label={cfg.label} title={getSyncMessage() || cfg.label}
      className="w-9 h-9 rounded-full flex items-center justify-center bg-white/90 backdrop-blur shadow-lg border border-slate-200 active:scale-95 transition">
      <span className={`block w-3 h-3 rounded-full ${cfg.flash ? 'sync-flash' : ''}`}
        style={{ background: cfg.color, boxShadow: `0 0 7px ${cfg.color}` }} />
    </button>
  );
}
