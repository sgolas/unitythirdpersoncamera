import { useEffect, useState } from 'react';
import { RefreshCw, Check, CloudOff, Cloud } from 'lucide-react';
import { getSyncState, runSync, type SyncState } from '../lib/autosync';

/**
 * Passive auto-sync indicator (replaces the manual Sync button). It reflects
 * the current sync state and never needs tapping — though tapping still forces
 * a sync (or opens Settings when sharing isn't set up yet).
 */
export function SyncStatus({ onSetup }: { onSetup?: () => void }) {
  const [state, setState] = useState<SyncState>(getSyncState());
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent).detail.state as SyncState;
      setState(s);
      if (s === 'ok') { setJustSynced(true); setTimeout(() => setJustSynced(false), 2000); }
    };
    window.addEventListener('sync-state', on);
    return () => window.removeEventListener('sync-state', on);
  }, []);

  function onTap() {
    if (state === 'unconfigured') onSetup?.();
    else void runSync();
  }

  if (state === 'unconfigured') {
    return (
      <button onClick={onTap}
        className="flex items-center gap-1.5 pl-2.5 pr-3 py-2 rounded-full text-sm font-bold shadow-lg backdrop-blur bg-white/90 text-slate-500 border border-slate-200 active:scale-95 transition">
        <Cloud size={15} /> Set up sync
      </button>
    );
  }

  const map = {
    syncing: { icon: <RefreshCw size={15} className="animate-spin" />, label: 'Syncing…', cls: 'bg-ink/90 text-white' },
    ok:      { icon: <Check size={15} />,   label: justSynced ? 'Synced' : '', cls: 'bg-ink/80 text-white' },
    offline: { icon: <CloudOff size={15} />, label: 'Offline', cls: 'bg-amber/90 text-white' },
  }[state];

  return (
    <button onClick={onTap} aria-label="Sync status"
      className={`flex items-center gap-1.5 py-2 rounded-full text-sm font-bold shadow-lg backdrop-blur active:scale-95 transition ${map.cls} ${map.label ? 'pl-2.5 pr-3' : 'w-9 justify-center'}`}>
      {map.icon}{map.label && <span>{map.label}</span>}
    </button>
  );
}
