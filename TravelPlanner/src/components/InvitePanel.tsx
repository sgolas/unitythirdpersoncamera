import { useState } from 'react';
import QRCode from 'qrcode';
import { Share2, Copy, Check, QrCode, Loader } from 'lucide-react';
import { ensureSyncCredentials, buildInviteLink } from '../lib/config';
import { syncNow } from '../db/sync';

/**
 * "Share this trip" — one button that guarantees the trip has sync
 * credentials, pushes the latest data so the portal has something to show,
 * then reveals a tap-to-open link (and QR) that signs family straight into
 * the read-only web view. No codes to invent, type, or remember.
 */
export function InvitePanel() {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  async function makeLink() {
    setBusy(true); setErr('');
    try {
      const { code, pass } = ensureSyncCredentials();
      // Push current data so the recipient's portal isn't empty.
      const res = await syncNow();
      if (!res.ok) { setErr(res.message || 'Could not upload the trip. Check your connection and try again.'); setBusy(false); return; }
      const url = buildInviteLink(code, pass);
      setLink(url);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } }));
    } catch {
      setErr('Something went wrong creating the link. Try again.');
    }
    setBusy(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the link is visible to copy manually */ }
  }

  async function share() {
    if (navigator.share) { try { await navigator.share({ title: 'My trip', url: link }); return; } catch { /* cancelled */ } }
    copy();
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="flex items-center gap-2 font-semibold text-slate-800 mb-1"><Share2 size={16} /> Share this trip</p>
      <p className="text-sm text-slate-500 leading-snug">
        Send family a link to <b>view</b> your trip in their browser — no app, no accounts, nothing to type. They see
        everything; only you can edit.
      </p>

      {!link ? (
        <button onClick={makeLink} disabled={busy}
          className="w-full mt-3 py-2.5 rounded-2xl font-semibold text-white bg-ink active:scale-[0.98] disabled:opacity-50 transition flex items-center justify-center gap-2">
          {busy ? <><Loader size={16} className="animate-spin" /> Preparing…</> : <><QrCode size={16} /> Create invite link</>}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex justify-center">
            <img src={qr} alt="Scan to open the trip" className="w-44 h-44 rounded-xl border border-slate-100" />
          </div>
          <div className="flex items-stretch gap-2">
            <input readOnly value={link} onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600" />
            <button onClick={copy} aria-label="Copy link"
              className="px-3 rounded-xl bg-slate-100 text-slate-600 active:bg-slate-200 flex items-center">
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            </button>
          </div>
          <button onClick={share}
            className="w-full py-2.5 rounded-2xl font-semibold text-white bg-accent active:scale-[0.98] transition flex items-center justify-center gap-2">
            <Share2 size={16} /> Send to family
          </button>
          <p className="text-xs text-slate-400">Tip: re-tap <b>Sync</b> after changes so viewers see the latest. Anyone with this link can view the trip — don't post it publicly.</p>
        </div>
      )}
      {err && <p className="text-sunset text-sm mt-2">{err}</p>}
    </div>
  );
}
