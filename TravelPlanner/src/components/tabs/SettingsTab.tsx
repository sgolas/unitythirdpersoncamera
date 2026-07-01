import { useState, useEffect } from 'react';
import { Smartphone, KeyRound, RefreshCw, Globe, Trash2, Check, Download } from 'lucide-react';
import { getOtaStatus, runOTA } from '../../lib/ota';
import { isNative } from '../../lib/platform';
import { getDeviceName, setDeviceName } from '../../db/database';
import { getSyncCode, getSyncPass, setSyncCredentials, getLastSync, isSyncConfigured } from '../../lib/config';
import { syncNow, wipeLocal } from '../../db/sync';
import { fmtStamp } from '../../utils/format';
import { TabHeader, Field, TextInput, PrimaryButton, GhostButton, ConfirmDelete } from '../ui';

export function SettingsTab() {
  const [device, setDevice] = useState(getDeviceName());
  const [code, setCode] = useState(getSyncCode());
  const [pass, setPass] = useState(getSyncPass());
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [wiping, setWiping] = useState(false);
  const [ota, setOta] = useState(getOtaStatus());
  const [otaBusy, setOtaBusy] = useState(false);
  const [bundleVer, setBundleVer] = useState('');

  const lastSync = getLastSync();

  useEffect(() => {
    if (!isNative) { setBundleVer('web'); return; }
    import('@capgo/capacitor-updater').then(async ({ CapacitorUpdater }) => {
      try { const c = await CapacitorUpdater.current(); setBundleVer(c?.bundle?.version ?? 'builtin'); } catch { setBundleVer('?'); }
    });
  }, []);

  async function checkUpdates() {
    setOtaBusy(true);
    // If an update applies, the app reloads and this never returns — that's fine.
    const s = await runOTA();
    setOta(s);
    setOtaBusy(false);
  }

  function saveAll() {
    setDeviceName(device);
    setSyncCredentials(code, pass);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testSync() {
    setSyncCredentials(code, pass);
    setDeviceName(device);
    setBusy(true); setMsg('');
    const res = await syncNow();
    setBusy(false);
    setMsg(res.message);
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Sync & Setup" subtitle="Link your family's devices"
        gradient="linear-gradient(135deg,#1e293b,#334155)" icon="⚙️" />

      <div className="px-4 py-4 space-y-5">
        {/* How it works */}
        <div className="bg-sky-50 border border-sky/20 rounded-2xl p-4 text-sm text-sky-900">
          <p className="font-semibold mb-1">🔒 How sync works</p>
          <p className="text-sky-800/90 leading-snug">
            Everything is stored on <b>your device</b> and works offline. Pick a shared <b>trip code</b> and
            <b> password</b>, enter the same on each family member's phone, then tap <b>Sync</b> to push and pull
            changes. Nothing syncs automatically.
          </p>
        </div>

        {/* Device name */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-3"><Smartphone size={16} /> This device</p>
          <Field label="Device name (shows in the change log)">
            <TextInput value={device} onChange={e => setDevice(e.target.value)} placeholder="e.g. Dad's iPhone" />
          </Field>
        </div>

        {/* Sync credentials */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-3"><KeyRound size={16} /> Trip sync code</p>
          <Field label="Trip code (share with family)">
            <TextInput value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. golas-europe-2026" autoCapitalize="none" />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Choose a shared password" />
          </Field>
          <p className="text-xs text-slate-400 -mt-2 mb-3">
            The first device to sync a code claims it; others must use the same password. This also unlocks the web portal.
          </p>
          <PrimaryButton onClick={saveAll}>{saved ? <span className="flex items-center justify-center gap-1"><Check size={16} /> Saved</span> : 'Save settings'}</PrimaryButton>
          <div className="mt-2"><GhostButton onClick={testSync} disabled={busy || !code || !pass}>
            <span className="flex items-center justify-center gap-2"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Save & sync now'}</span>
          </GhostButton></div>
          {msg && <p className="text-center text-sm mt-2 text-slate-600">{msg}</p>}
        </div>

        {/* Web portal */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-2"><Globe size={16} /> Web portal</p>
          <p className="text-sm text-slate-500 leading-snug">
            View your trip read-only at <b>sgolas.com</b>. Open the site, enter the same trip code and password,
            and you'll see everything (no editing from the web).
          </p>
          {isSyncConfigured() && (
            <p className="text-xs text-slate-400 mt-2">
              {lastSync ? `Last synced ${fmtStamp(lastSync)}` : 'Tap Sync to publish your data to the portal.'}
            </p>
          )}
        </div>

        {/* App updates (OTA) */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-2"><Download size={16} /> App updates</p>
          <p className="text-sm text-slate-500">Running version: <b className="text-slate-700">{bundleVer || '…'}</b></p>
          <p className="text-sm text-slate-500 mt-1 break-words">{ota}</p>
          <button onClick={checkUpdates} disabled={otaBusy}
            className="w-full mt-3 py-2.5 rounded-2xl font-semibold text-white bg-ink active:scale-[0.98] disabled:opacity-40 transition">
            {otaBusy ? 'Checking…' : 'Check for updates now'}
          </button>
          <p className="text-xs text-slate-400 mt-2">Updates also download automatically each time you open the app.</p>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-2"><Trash2 size={16} /> Reset this device</p>
          <p className="text-sm text-slate-500 mb-3">Clears local data on this phone only. If sync is set up, you can pull it all back with Sync.</p>
          <button onClick={() => setWiping(true)} className="w-full py-2.5 rounded-2xl font-semibold text-sunset bg-rose-50 active:bg-rose-100">
            Clear local data
          </button>
        </div>

        <p className="text-center text-xs text-slate-300 pt-2">Trip Planner · local-first</p>
      </div>

      {wiping && (
        <ConfirmDelete label="All local data on this device"
          onCancel={() => setWiping(false)}
          onConfirm={async () => { await wipeLocal(); setWiping(false); location.reload(); }} />
      )}
    </div>
  );
}
