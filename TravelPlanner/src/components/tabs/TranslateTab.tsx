import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, Check, Loader, Download, Languages } from 'lucide-react';
import { TabHeader } from '../ui';
import {
  LANGS, langName, translationAvailable, downloadedLangs, downloadLang, translateText, type Lang,
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
  const [downloading, setDownloading] = useState<string>('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState<Lang[]>([]);
  const seq = useRef(0);

  useEffect(() => { downloadedLangs().then(setReady); }, []);

  const needed = [from, to].filter((l, i, a) => a.indexOf(l) === i);
  const missing = needed.filter(l => !ready.includes(l));

  function swap() {
    setFrom(to); setTo(from);
    setSrc(out); setOut(src);
  }

  async function ensureModels(): Promise<boolean> {
    for (const l of missing) {
      setDownloading(langName(l));
      try { await downloadLang(l); }
      catch { setErr(`Couldn't download ${langName(l)} — connect to wifi and try again.`); setDownloading(''); return false; }
    }
    setDownloading('');
    setReady(await downloadedLangs());
    return true;
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

  async function onTranslate() {
    if (!(await ensureModels())) return;
    run(src, from, to);
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

        {/* Download prompt / translate button */}
        {available && missing.length > 0 && (
          <button onClick={onTranslate} disabled={!!downloading || !src.trim()}
            className="w-full py-3 rounded-2xl font-bold text-white accent-gradient active:scale-[0.98] disabled:opacity-50 transition flex items-center justify-center gap-2">
            {downloading
              ? <><Loader size={17} className="animate-spin" /> Downloading {downloading}… (~30 MB, one time)</>
              : <><Download size={17} /> Get {missing.map(langName).join(' + ')} &amp; translate</>}
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
    </div>
  );
}
