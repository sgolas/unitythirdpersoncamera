import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, Check, Loader, Download, Languages, HelpCircle, Plus, Trash2, ExternalLink } from 'lucide-react';
import { TabHeader, Overlay } from '../ui';
import {
  LANGS, langName, translationAvailable, downloadedLangs, downloadLang, removeLang,
  translateText, openPhoneSettings, type Lang,
} from '../../lib/translate';

/**
 * Offline translator — type in one language, read it in another. English,
 * Italian and Polish. Each language downloads once (~30 MB) then works fully
 * offline. Text only.
 */
export function TranslateTab() {
  const available = translationAvailable();
  const [from, setFrom] = useState<Lang>('en');
  const [to, setTo] = useState<Lang>('it');
  const [src, setSrc] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState<Lang[]>([]);
  const [langMgr, setLangMgr] = useState(false);
  const [help, setHelp] = useState(false);
  const seq = useRef(0);

  const refreshReady = () => downloadedLangs().then(setReady);
  useEffect(() => { refreshReady(); }, []);

  const needed = [from, to].filter((l, i, a) => a.indexOf(l) === i);
  const missing = needed.filter(l => !ready.includes(l));

  function swap() {
    setFrom(to); setTo(from);
    setSrc(out); setOut(src);
  }

  async function run(text: string, f: Lang, t: Lang) {
    const text2 = text.trim();
    if (!text2 || f === t) { setOut(''); return; }
    const mine = ++seq.current;
    setBusy(true); setErr('');
    try {
      const res = await translateText(text2, f, t);
      if (mine === seq.current) setOut(res);
    } catch (e) {
      if (mine === seq.current) setErr(e instanceof Error ? e.message : 'Translation failed.');
    }
    if (mine === seq.current) setBusy(false);
  }

  // Once the needed models are ready, translate live as you type.
  useEffect(() => {
    if (!available || missing.length > 0) return;
    const t = setTimeout(() => run(src, from, to), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, from, to, ready]);

  function copy() {
    navigator.clipboard?.writeText(out).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  const LangSelect = ({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) => (
    <select value={value} onChange={e => onChange(e.target.value as Lang)}
      className="rounded-xl border border-line bg-surface-2 px-3 py-2 font-semibold text-content">
      {LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
    </select>
  );

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Translate" subtitle="Offline · English · Italian · Polish"
        gradient="linear-gradient(135deg,#7c3aed,#a78bfa)" icon="💬" />

      <div className="px-4 py-5 space-y-3 max-w-md mx-auto">
        {/* Add-language + Help row */}
        <div className="flex items-center gap-2">
          <button onClick={() => setLangMgr(true)}
            className="flex-1 py-2.5 rounded-2xl font-semibold text-content bg-surface border border-line shadow-soft active:scale-[0.98] transition flex items-center justify-center gap-1.5">
            <Plus size={16} className="text-accent" /> Add language
            {available && missing.length > 0 && <span className="ml-1 w-2 h-2 rounded-full bg-sunset" />}
          </button>
          <button onClick={() => setHelp(true)} aria-label="How it works"
            className="w-11 h-11 rounded-2xl bg-surface border border-line shadow-soft flex items-center justify-center active:scale-95 transition">
            <HelpCircle size={19} className="text-accent" />
          </button>
        </div>

        {!available && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
            The offline translator lives in the Trip Planner app (v1.5 or newer). Install the latest app to use it.
          </div>
        )}

        {/* Language bar */}
        <div className="flex items-center gap-2 justify-center">
          <LangSelect value={from} onChange={setFrom} />
          <button onClick={swap} aria-label="Swap languages"
            className="w-10 h-10 rounded-full accent-gradient text-white flex items-center justify-center shadow active:scale-90 transition flex-shrink-0">
            <ArrowLeftRight size={16} />
          </button>
          <LangSelect value={to} onChange={setTo} />
        </div>

        {/* Source */}
        <div className="bg-surface rounded-3xl p-3.5 shadow-soft border border-line">
          <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">{langName(from)}</p>
          <textarea value={src} onChange={e => setSrc(e.target.value)} rows={3} disabled={!available}
            placeholder={available ? `Type in ${langName(from)}…` : 'Available in the app'}
            className="w-full resize-none bg-transparent text-lg text-content outline-none placeholder:text-muted disabled:opacity-60" />
        </div>

        {/* Needs-download hint */}
        {available && missing.length > 0 && src.trim() && (
          <button onClick={() => setLangMgr(true)}
            className="w-full py-3 rounded-2xl font-bold text-white accent-gradient active:scale-[0.98] transition flex items-center justify-center gap-2">
            <Download size={17} /> Download {missing.map(langName).join(' + ')} to translate
          </button>
        )}

        {/* Result */}
        <div className="bg-surface rounded-3xl p-3.5 shadow-soft border border-line relative min-h-[92px]">
          <p className="text-xs font-bold text-accent uppercase tracking-wide mb-1.5">{langName(to)}</p>
          <p className="text-lg text-content whitespace-pre-wrap break-words pr-8 min-h-[28px]">
            {out || <span className="text-muted">{busy ? '…' : 'Translation appears here'}</span>}
          </p>
          {busy && <Loader size={16} className="animate-spin text-accent absolute top-3.5 right-3.5" />}
          {out && !busy && (
            <button onClick={copy} aria-label="Copy translation"
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted active:bg-slate-100">
              {copied ? <Check size={16} className="text-mint" /> : <Copy size={16} />}
            </button>
          )}
        </div>

        {err && <p className="text-sunset text-sm px-1">{err}</p>}

        <p className="text-center text-xs text-muted px-6 flex items-center justify-center gap-1.5">
          <Languages size={13} /> Works offline once each language is downloaded. Nothing you type leaves the phone.
        </p>
      </div>

      {langMgr && (
        <LanguageManager available={available} ready={ready} onChanged={refreshReady} onClose={() => setLangMgr(false)} />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ── Language manager: download / remove offline packs ──────── */
function LanguageManager({ available, ready, onChanged, onClose }: {
  available: boolean; ready: Lang[]; onChanged: () => void; onClose: () => void;
}) {
  const [working, setWorking] = useState<Lang | ''>('');
  const [err, setErr] = useState('');

  async function get(l: Lang) {
    setWorking(l); setErr('');
    try { await downloadLang(l); onChanged(); }
    catch { setErr(`Couldn't download ${langName(l)} — connect to wifi and try again.`); }
    setWorking('');
  }
  async function drop(l: Lang) {
    setWorking(l); setErr('');
    try { await removeLang(l); onChanged(); } catch { /* ignore */ }
    setWorking('');
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
        <div className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="font-bold text-content text-lg">Languages</p>
          <p className="text-xs text-muted mb-4">Download a language once (~30 MB, use wifi). After that it translates with no internet.</p>

          {!available ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              Install Trip Planner v1.5+ to download languages.
            </p>
          ) : (
            <div className="space-y-2">
              {LANGS.map(l => {
                const have = ready.includes(l.code);
                const busy = working === l.code;
                return (
                  <div key={l.code} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-line">
                    <span className="text-xl">{l.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-content">{l.name}</p>
                      <p className={`text-xs ${have ? 'text-mint' : 'text-muted'}`}>
                        {have ? 'Ready offline ✓' : 'Not downloaded'}
                      </p>
                    </div>
                    {busy ? (
                      <Loader size={18} className="animate-spin text-accent" />
                    ) : have ? (
                      <button onClick={() => drop(l.code)} aria-label={`Remove ${l.name}`}
                        className="p-2 rounded-lg text-muted active:bg-slate-100"><Trash2 size={16} /></button>
                    ) : (
                      <button onClick={() => get(l.code)}
                        className="px-3 py-1.5 rounded-xl text-sm font-semibold accent-gradient text-white flex items-center gap-1.5 active:scale-95">
                        <Download size={14} /> Get
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {err && <p className="text-sunset text-xs mt-2">{err}</p>}

          <button onClick={openPhoneSettings}
            className="mt-4 w-full py-2 rounded-xl text-sm font-semibold text-muted border border-line active:bg-slate-50 flex items-center justify-center gap-1.5">
            <ExternalLink size={14} /> Trouble downloading? Open phone settings
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ── Help: what's needed and how ────────────────────────────── */
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Overlay>
      <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
        <div className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <p className="font-bold text-content text-lg mb-1">How offline translation works</p>
          <div className="text-sm text-content space-y-3 mt-3">
            <p>To translate without internet, each language needs a small one-time download.</p>
            <div>
              <p className="font-semibold text-content mb-1">Do this once, on wifi:</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted">
                <li>Tap <b className="text-content">Add language</b>.</li>
                <li>Tap <b className="text-content">Get</b> next to Italian and Polish (about 30 MB each).</li>
                <li>Wait for each to say <b className="text-mint">Ready offline ✓</b>.</li>
              </ol>
            </div>
            <p>After that it works <b>anywhere — even in airplane mode</b>. Everything you type stays on your phone; nothing is sent anywhere.</p>
            <p className="text-muted">You don't need to dig through Android settings — it's all handled here in the app. If a download won't finish, connect to wifi, make sure you have a little free storage, then try again (or use the settings link in Add language to check).</p>
          </div>
          <button onClick={onClose}
            className="mt-5 w-full py-2.5 rounded-2xl font-bold text-white accent-gradient active:scale-[0.98] transition">
            Got it
          </button>
        </div>
      </div>
    </Overlay>
  );
}
