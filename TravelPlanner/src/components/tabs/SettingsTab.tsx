import { useState, useEffect } from 'react';
import { Smartphone, KeyRound, RefreshCw, Globe, Trash2, Check, Download, Palette, Sun, Moon, Monitor, Coins, AlertTriangle } from 'lucide-react';
import { getOtaStatus, runOTA } from '../../lib/ota';
import { isNative } from '../../lib/platform';
import { getMode, setMode, getAccent, setAccent, ACCENTS, type ThemeMode, type Accent } from '../../lib/theme';
import {
  HOME_OPTIONS, AWAY_OPTIONS, getHomeCurrency, getAwayCurrency, setHomeCurrency, setAwayCurrency,
} from '../../lib/currency';
import { useTrip } from '../../hooks/useTrip';
import { money } from '../../types';
import type { TripMeta } from '../../types';
import { getDeviceName, setDeviceName, put } from '../../db/database';
import { getSyncCode, getSyncPass, setSyncCredentials, getLastSync, isSyncConfigured } from '../../lib/config';
import { syncNow, wipeLocal } from '../../db/sync';
import { fmtStamp } from '../../utils/format';
import { TabHeader, Field, TextInput, PrimaryButton, GhostButton } from '../ui';

export function SettingsTab() {
  const [device, setDevice] = useState(getDeviceName());
  const [code, setCode] = useState(getSyncCode());
  const [pass, setPass] = useState(getSyncPass());
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [wiping, setWiping] = useState(false);
  const [mode, setModeS] = useState<ThemeMode>(getMode());
  const [accent, setAccentS] = useState<Accent>(getAccent());
  const [home, setHomeS] = useState(getHomeCurrency());
  const [away, setAwayS] = useState(getAwayCurrency());
  const trip = useTrip();

  function pickHome(code: string) { setHomeCurrency(code); setHomeS(code); syncTripCurrency(code, away); }
  function pickAway(code: string) { setAwayCurrency(code); setAwayS(code); syncTripCurrency(home, code); }
  function syncTripCurrency(h: string, a: string) {
    // Keep the stored trip record in step so entered amounts read as "away".
    if (trip && (trip.tripCurrency !== a || trip.homeCurrency !== h)) {
      put<TripMeta>({ ...trip, tripCurrency: a, homeCurrency: h }, `Set currencies to ${a} / ${h}`);
    }
  }
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
        {/* Appearance — theme + accent */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-3"><Palette size={16} /> Appearance</p>
          <div className="grid grid-cols-3 gap-2">
            {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'Auto']] as const).map(([m, Icon, label]) => (
              <button key={m} onClick={() => { setMode(m); setModeS(m); }}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition press ${mode === m ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                <Icon size={18} /> <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-4 mb-2">Accent colour</p>
          <div className="flex gap-2.5">
            {ACCENTS.map(a => (
              <button key={a.key} onClick={() => { setAccent(a.key); setAccentS(a.key); }}
                aria-label={a.label}
                className={`w-9 h-9 rounded-full press transition ${accent === a.key ? 'ring-2 ring-slate-400 scale-110' : ''}`}
                style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})` }} />
            ))}
          </div>
        </div>

        {/* Currencies — home + away, both always shown together */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-1"><Coins size={16} /> Currencies</p>
          <p className="text-xs text-slate-400 mb-3">Every amount shows in both your home and away currency.</p>

          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Home currency</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {HOME_OPTIONS.map(o => (
              <button key={o.code} onClick={() => pickHome(o.code)}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 transition press ${home === o.code ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                <span className="text-sm font-semibold">{o.label} · {o.sym}</span>
              </button>
            ))}
          </div>

          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Away currency (where you're spending)</p>
          <div className="grid grid-cols-2 gap-2">
            {AWAY_OPTIONS.map(o => (
              <button key={o.code} onClick={() => pickAway(o.code)}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 transition press ${away === o.code ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                <span className="text-sm font-semibold">{o.label} · {o.sym}</span>
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-xl px-3 py-2">
            Preview: <b className="text-slate-700">{money(100, away)}</b>
          </p>
        </div>

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
          <p className="flex items-center gap-2 font-semibold text-slate-800 mb-2"><Trash2 size={16} /> Clear data</p>
          <p className="text-sm text-slate-500 mb-3">Wipes all trip data on this device. If sync is set up, you can pull it all back with Sync.</p>
          <button onClick={() => setWiping(true)} className="w-full py-2.5 rounded-2xl font-semibold text-sunset bg-rose-50 active:bg-rose-100">
            Clear data
          </button>
        </div>

        <p className="text-center text-xs text-slate-300 pt-2">Trip Planner · local-first</p>
      </div>

      {wiping && (
        <WipeConfirm synced={isSyncConfigured()}
          onCancel={() => setWiping(false)}
          onConfirm={async () => { await wipeLocal(); setWiping(false); location.reload(); }} />
      )}
    </div>
  );
}

/** Hard-stop confirmation: user must type "I understand" to wipe the device. */
function WipeConfirm({ synced, onCancel, onConfirm }: {
  synced: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const [text, setText] = useState('');
  const ok = text.trim().toLowerCase() === 'i understand';
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm animate-pop" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="text-rose-600" size={28} />
        </div>
        <h2 className="text-lg font-bold text-slate-900 text-center">You are about to wipe all data off this device</h2>
        <p className="text-sm text-slate-600 text-center mt-2">
          This clears every trip record stored on this device. This cannot be undone
          {synced ? ' — but if sync is set up, you can pull it back with Sync.' : '.'}
        </p>
        <p className="text-xs font-semibold text-slate-500 mt-4 mb-1">Type <b className="text-slate-700">I understand</b> to confirm</p>
        <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="I understand"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-rose-400" />
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-2xl font-semibold text-slate-600 bg-slate-100 active:bg-slate-200">Cancel</button>
          <button onClick={onConfirm} disabled={!ok}
            className="flex-1 py-2.5 rounded-2xl font-semibold text-white bg-rose-600 active:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
            Wipe data
          </button>
        </div>
      </div>
    </div>
  );
}
