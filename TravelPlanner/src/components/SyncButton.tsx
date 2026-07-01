import { useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { syncNow } from '../db/sync';
import { isSyncConfigured } from '../lib/config';

/** Floating manual-sync button. Nothing syncs unless this is tapped. */
export function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSync() {
    if (busy) return;
    setBusy(true);
    setToast(null);
    const res = await syncNow();
    setBusy(false);
    setToast({ ok: res.ok, msg: res.message });
    setTimeout(() => setToast(null), 3500);
  }

  const configured = isSyncConfigured();

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={busy}
        className={`flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full text-sm font-bold shadow-lg backdrop-blur transition active:scale-95 ${
          configured ? 'bg-ink/90 text-white' : 'bg-white/90 text-slate-500 border border-slate-200'
        }`}
      >
        <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
        {busy ? 'Syncing…' : configured ? 'Sync' : 'Set up sync'}
      </button>

      {toast && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-lg animate-fadeUp ${
          toast.ok ? 'bg-mint text-white' : 'bg-sunset text-white'
        }`}>
          {toast.ok ? <Check size={13} /> : <AlertCircle size={13} />}
          <span className="max-w-[220px]">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
