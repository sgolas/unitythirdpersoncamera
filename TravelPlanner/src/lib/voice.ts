/**
 * Voice + online layer for the translator: speech-to-text, an online text
 * translation (used when no offline model is downloaded), and an organic
 * text-to-speech voice. The *offline* text translation lives in ./translate
 * (ML Kit); this module adds voice I/O and the online path around it.
 *
 *   • listen()          — native speech recognition (offline-capable with a
 *                         language pack); Web Speech API in the browser.
 *   • translateOnline() — via our /api/translate relay on web, and directly
 *                         from the phone's IP (CapacitorHttp) on device;
 *                         travel phrasebook + cache when there's no signal.
 *   • speak()           — native Android neural TTS (organic, offline); falls
 *                         back to the browser's speechSynthesis.
 */
import { TRANSLATE_ENDPOINT } from './config';
import { isNative } from './platform';
import { langByCode, offlinePhrase } from './phrasebook';

/* ── Online / offline text translation ───────────────────────── */
const CACHE_KEY = 'translate.cache.v1';
type Cache = Record<string, string>;
function loadCache(): Cache { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function saveCache(c: Cache) {
  try {
    const keys = Object.keys(c);
    if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete c[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* full */ }
}

export interface Translation { text: string; source: 'online' | 'offline' | 'cache' }

/** On device, translate from the phone's own IP (CapacitorHttp bypasses CORS
 *  and the shared-IP throttling a server relay would hit). */
async function nativeTranslate(q: string, from: string, to: string): Promise<string | null> {
  try {
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({
      url: 'https://translate.googleapis.com/translate_a/single',
      params: { client: 'gtx', sl: from || 'auto', tl: to, dt: 't', q },
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const text = (data?.[0] ?? []).map((seg: [string]) => seg[0]).join('');
    return text || null;
  } catch { return null; }
}

async function serverTranslate(q: string, from: string, to: string): Promise<string | null> {
  try {
    const r = await fetch(TRANSLATE_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, from, to }),
    });
    if (!r.ok) return null;
    const d = await r.json() as { text?: string };
    return d.text || null;
  } catch { return null; }
}

/** Online translation with offline phrasebook + cache fallback. */
export async function translateOnline(text: string, from: string, to: string): Promise<Translation> {
  const q = text.trim();
  if (!q) return { text: '', source: 'offline' };
  const cache = loadCache();
  const key = `${from}|${to}|${q.toLowerCase()}`;

  const online = (isNative ? await nativeTranslate(q, from, to) : null)
    ?? await serverTranslate(q, from, to);
  if (online) { cache[key] = online; saveCache(cache); return { text: online, source: 'online' }; }

  const phrase = offlinePhrase(q, to);
  if (phrase) return { text: phrase, source: 'offline' };
  if (cache[key]) return { text: cache[key], source: 'cache' };
  throw new Error('offline');
}

/* ── Speech recognition (speech → text) ──────────────────────── */
export function sttAvailable(): boolean {
  if (isNative) return true;
  return typeof window !== 'undefined' &&
    !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);
}

export async function listen(langCode: string): Promise<string> {
  const bcp = langByCode(langCode)?.bcp47 || langCode;
  if (isNative) {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      const req = await SpeechRecognition.requestPermissions();
      if (req.speechRecognition !== 'granted') throw new Error('Microphone permission is off — enable it for Trip Planner in your phone Settings.');
    }
    const res = await SpeechRecognition.start({ language: bcp, maxResults: 1, partialResults: false, popup: false });
    return (res.matches && res.matches[0]) ? res.matches[0] : '';
  }
  const Rec = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  if (!Rec) throw new Error('Voice input isn’t available on this device.');
  return new Promise<string>((resolve, reject) => {
    const rec = new Rec();
    rec.lang = bcp; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e: any) => resolve(e.results[0][0].transcript);
    rec.onerror = (e: any) => reject(new Error(e.error === 'not-allowed' ? 'Microphone permission was blocked.' : 'Didn’t catch that — try again.'));
    rec.start();
  });
}

/* ── Text to speech (organic voice) ──────────────────────────── */
let webVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const load = () => { webVoices = window.speechSynthesis.getVoices(); };
  load();
  window.speechSynthesis.onvoiceschanged = load;
}
function pickWebVoice(bcp: string): SpeechSynthesisVoice | undefined {
  const base = bcp.split('-')[0];
  const forLang = webVoices.filter(v => v.lang.toLowerCase().startsWith(base));
  const score = (v: SpeechSynthesisVoice) => {
    const n = `${v.name} ${v.voiceURI}`.toLowerCase();
    let s = 0;
    if (/neural|natural|wavenet|premium|enhanced/.test(n)) s += 4;
    if (/google/.test(n)) s += 2;
    if (v.lang.toLowerCase() === bcp.toLowerCase()) s += 1;
    return s;
  };
  return forLang.sort((a, b) => score(b) - score(a))[0];
}

export async function speak(text: string, langCode: string): Promise<void> {
  if (!text.trim()) return;
  const bcp = langByCode(langCode)?.bcp47 || langCode;
  if (isNative) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    try { await TextToSpeech.stop(); } catch { /* nothing playing */ }
    await TextToSpeech.speak({ text, lang: bcp, rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' });
    return;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp;
  const v = pickWebVoice(bcp);
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export async function stopSpeaking(): Promise<void> {
  if (isNative) {
    try { const { TextToSpeech } = await import('@capacitor-community/text-to-speech'); await TextToSpeech.stop(); } catch { /* */ }
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
