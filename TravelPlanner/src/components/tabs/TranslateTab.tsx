import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, Check, Loader, Download, Languages, HelpCircle, Plus, Trash2, ExternalLink, Mic, Volume2, WifiOff } from 'lucide-react';
import { TabHeader, Overlay } from '../ui';
import {
  langName, translationAvailable, downloadedLangs, downloadLang, removeLang,
  translateText, openPhoneSettings, LANGS as OFFLINE_LANGS, type Lang as OfflineLang,
} from '../../lib/translate';
import { VOICE_LANGS, langByCode } from '../../lib/phrasebook';
import { translateOnline, listen, speak, sttAvailable } from '../../lib/voice';

/**
 * Translator — speak or type in one language, read/hear it in another.
 *   • Voice in + organic voice out (native speech recognition + neural TTS).
 *   • Offline: English/Italian/Polish translate fully offline once each
 *     language pack is downloaded (ML Kit, ~30 MB each).
 *   • Every other language (and offline pairs before download) translate over
 *     the internet, with a travel phrasebook + cache when there's no signal.
 */

const OFFLINE_CODES = OFFLINE_LANGS.map(l => l.code) as string[]; // en/it/pl
const isOfflineCode = (c: string): c is OfflineLang => OFFLINE_CODES.includes(c);

type Src = 'offline-model' | 'online' | 'offline' | 'cache';

export function TranslateTab() {
  const nativeOffline = translationAvailable();
  const canVoice = sttAvailable();
  const [from, setFrom] = useState('en');
  const [to, setTo] = useState('it');
  const [src, setSrc] = useState('');
  const [out, setOut] = useState('');
  const [source, setSource] = useState<Src | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState<OfflineLang[]>([]);
  const [langMgr, setLangMgr] = useState(false);
  const [help, setHelp] = useState(false);
  const seq = useRef(0);

  const refreshReady = () => downloadedLangs().then(setReady);
  useEffect(() => { refreshReady(); }, []);

  // Offline (ML Kit) is used only when both languages support it AND are downloaded.
  const canOffline = from !== to && isOfflineCode(from) && isOfflineCode(to)
    && ready.includes(from) && ready.includes(to);

  function swap() { setFrom(to); setTo(from); setSrc(out); setOut(src); setSource(null); }

  /** Translate `text` and update the result. Returns the translated text. */
  async function run(text: string, f: string, t: string): Promise<string> {
    const q = text.trim();
    if (!q || f === t) { setOut(''); setSource(null); return ''; }
    const mine = ++seq.current;
    setBusy(true); setErr('');
    try {
      if (isOfflineCode(f) && isOfflineCode(t) && ready.includes(f) && ready.includes(t)) {
        const res = await translateText(q, f, t);
        if (mine === seq.current) { setOut(res); setSource('offline-model'); }
        return res;
      }
      const res = await translateOnline(q, f, t);
      if (mine === seq.current) { setOut(res.text); setSource(res.source); }
      return res.text;
    } catch (e) {
      if (mine === seq.current) {
        setErr(e instanceof Error && e.message !== 'offline'
          ? e.message
          : 'No internet, and this phrase isn’t saved offline yet.');
      }
      return '';
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }

  // Live translate as you type (debounced) — offline is instant/free; the
  // online path is cached + rate-limited so this stays cheap.
  useEffect(() => {
    const q = src.trim();
    if (!q) { setOut(''); setSource(null); return; }
    const delay = canOffline ? 350 : 650;
    const timer = setTimeout(() => { run(src, from, to); }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, from, to, ready]);

  /** Voice: listen in the source language, translate, and speak the result. */
  async function mic() {
    if (!canVoice || listening || busy) return;
    setListening(true); setErr('');
    try {
      const heard = await listen(from);
      if (!heard.trim()) { setErr('Didn’t catch anything — try again.'); return; }
      setSrc(heard);
      const translated = await run(heard, from, to);
      if (translated) speak(translated, to).catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Voice input failed.');
    } finally {
      setListening(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(out).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  const LangSelect = ({ value, onChange }: { value: string; onChange: (l: string) => void }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded-xl border border-line bg-surface-2 px-3 py-2 font-semibold text-content max-w-[42vw]">
      {VOICE_LANGS.map(l => (
        <option key={l.code} value={l.code}>
          {l.flag} {l.name}{isOfflineCode(l.code) ? ' ⤓' : ''}
        </option>
      ))}
    </select>
  );

  const badge = source === 'offline-model' ? { text: 'Offline ✓', cls: 'text-mint' }
    : source === 'online' ? null
    : source === 'offline' ? { text: 'Offline phrasebook', cls: 'text-muted' }
    : source === 'cache' ? { text: 'Saved offline', cls: 'text-muted' } : null;

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Translate" subtitle="Speak or type — hear it in their language"
        gradient="linear-gradient(135deg,#7c3aed,#ec4899)" icon="🗣️" />

      <div className="px-4 py-5 space-y-3 max-w-md mx-auto">
        {/* Add-language + Help row */}
        <div className="flex items-center gap-2">
          <button onClick={() => setLangMgr(true)}
            className="flex-1 py-2.5 rounded-2xl font-semibold text-content bg-surface border border-line shadow-soft active:scale-[0.98] transition flex items-center justify-center gap-1.5">
            <Plus size={16} className="text-accent" /> Offline languages
          </button>
          <button onClick={() => setHelp(true)} aria-label="How it works"
            className="w-11 h-11 rounded-2xl bg-surface border border-line shadow-soft flex items-center justify-center active:scale-95 transition">
            <HelpCircle size={19} className="text-accent" />
          </button>
        </div>

        {/* Language bar */}
        <div className="flex items-center gap-2 justify-center">
          <LangSelect value={from} onChange={v => { setFrom(v); setSource(null); }} />
          <button onClick={swap} aria-label="Swap languages"
            className="w-10 h-10 rounded-full accent-gradient text-white flex items-center justify-center shadow active:scale-90 transition flex-shrink-0">
            <ArrowLeftRight size={16} />
          </button>
          <LangSelect value={to} onChange={v => { setTo(v); setSource(null); }} />
        </div>

        {/* Source (type or dictate) */}
        <div className="bg-surface rounded-3xl p-3.5 shadow-soft border border-line">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-muted uppercase tracking-wide">{langByCode(from)?.name ?? from}</p>
            {canVoice && (
              <button onClick={mic} disabled={busy} aria-label={`Speak ${langByCode(from)?.name}`}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-white accent-gradient active:scale-90 transition disabled:opacity-40 ${listening ? 'animate-pulse ring-4 ring-accent/40' : ''}`}>
                <Mic size={17} />
              </button>
            )}
          </div>
          <textarea value={src} onChange={e => setSrc(e.target.value)} rows={3}
            placeholder={listening ? 'Listening… speak now' : `Type or tap the mic in ${langByCode(from)?.name}…`}
            className="w-full resize-none bg-transparent text-lg text-content outline-none placeholder:text-muted" />
        </div>

        {/* Result */}
        <div className="bg-surface rounded-3xl p-3.5 shadow-soft border border-line relative min-h-[96px]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-accent uppercase tracking-wide">{langByCode(to)?.name ?? to}</p>
            {out && !busy && (
              <div className="flex items-center gap-1">
                <button onClick={() => speak(out, to)} aria-label="Play translation"
                  className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center active:bg-accent/20">
                  <Volume2 size={15} />
                </button>
                <button onClick={copy} aria-label="Copy translation"
                  className="w-8 h-8 rounded-full text-muted flex items-center justify-center active:bg-slate-100">
                  {copied ? <Check size={15} className="text-mint" /> : <Copy size={15} />}
                </button>
              </div>
            )}
          </div>
          <p className="text-lg text-content whitespace-pre-wrap break-words min-h-[28px]">
            {out || <span className="text-muted">{busy ? '…' : 'Translation appears here'}</span>}
          </p>
          {busy && <Loader size={16} className="animate-spin text-accent absolute bottom-3.5 right-3.5" />}
          {badge && (
            <p className={`text-[11px] mt-2 flex items-center gap-1 ${badge.cls}`}>
              {source !== 'offline-model' && <WifiOff size={11} />}{badge.text}
            </p>
          )}
        </div>

        {err && <p className="text-sunset text-sm px-1">{err}</p>}

        <p className="text-center text-xs text-muted px-6 flex items-center justify-center gap-1.5">
          <Languages size={13} /> English · Italian · Polish work offline once downloaded. Other languages use the internet.
        </p>
      </div>

      {langMgr && (
        <LanguageManager available={nativeOffline} ready={ready} onChanged={refreshReady} onClose={() => setLangMgr(false)} />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ── Language manager: download / remove offline packs ──────── */
function LanguageManager({ available, ready, onChanged, onClose }: {
  available: boolean; ready: OfflineLang[]; onChanged: () => void; onClose: () => void;
}) {
  const [working, setWorking] = useState<OfflineLang | ''>('');
  const [err, setErr] = useState('');

  async function get(l: OfflineLang) {
    setWorking(l); setErr('');
    try { await downloadLang(l); onChanged(); }
    catch { setErr(`Couldn't download ${langName(l)} — connect to wifi and try again.`); }
    setWorking('');
  }
  async function drop(l: OfflineLang) {
    setWorking(l); setErr('');
    try { await removeLang(l); onChanged(); } catch { /* ignore */ }
    setWorking('');
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
        <div className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="font-bold text-content text-lg">Offline languages</p>
          <p className="text-xs text-muted mb-4">Download a language once (~30 MB, use wifi) and it translates with no internet. Other languages always use the internet.</p>

          {!available ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              Offline downloads need the Trip Planner app (v1.5+). Other languages still translate online here.
            </p>
          ) : (
            <div className="space-y-2">
              {OFFLINE_LANGS.map(l => {
                const have = ready.includes(l.code);
                const busy = working === l.code;
                return (
                  <div key={l.code} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-line">
                    <span className="text-xl">{l.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-content">{l.name}</p>
                      <p className={`text-xs ${have ? 'text-mint' : 'text-muted'}`}>{have ? 'Ready offline ✓' : 'Not downloaded'}</p>
                    </div>
                    {busy ? <Loader size={18} className="animate-spin text-accent" />
                      : have ? (
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

/* ── Help ───────────────────────────────────────────────────── */
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Overlay>
      <div className="fixed inset-0 z-[700] bg-black/40 flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
        <div className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <p className="font-bold text-content text-lg mb-1">How the translator works</p>
          <div className="text-sm text-content space-y-3 mt-3">
            <p><b>Speak or type.</b> Tap the 🎤 mic and talk in your language — it listens, translates, and reads the answer back out loud in theirs. The 🔊 button replays any translation.</p>
            <div>
              <p className="font-semibold text-content mb-1">Offline (English · Italian · Polish):</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted">
                <li>Tap <b className="text-content">Offline languages</b>.</li>
                <li>Tap <b className="text-content">Get</b> next to Italian and Polish (~30 MB each, on wifi).</li>
                <li>After that those three translate <b>anywhere — even in airplane mode</b>.</li>
              </ol>
            </div>
            <p><b>Every other language</b> translates over the internet. Common travel phrases still work offline from a built-in phrasebook.</p>
            <p className="text-muted">Speaking and listening happen on your phone; offline translation never leaves the device.</p>
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
