/**
 * AI-assisted booking extraction. Posts the PDF text to our /api/extract
 * Cloudflare Function (Workers AI, key-free and server-side) and returns the
 * structured fields. Best-effort only: any failure (offline, unconfigured,
 * timeout) resolves to null so the caller falls back to the on-device parser.
 */
import { EXTRACT_ENDPOINT } from './config';

async function callExtract(text: string, kind: 'activity' | 'stay'): Promise<Record<string, any> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const r = await fetch(EXTRACT_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 9000), kind }), signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = await r.json();
    return data?.fields && typeof data.fields === 'object' ? data.fields : null;
  } catch {
    return null;
  }
}

export interface AiStay {
  name: string; city: string; address: string; checkIn: string; checkOut: string;
  confirmation: string; cost: number; costCurrency: string;
}
export interface AiActivity {
  title: string; provider: string; date: string; startTime: string; endTime: string;
  location: string; confirmation: string; cost: number; costCurrency: string;
}

export async function aiExtractStay(text: string): Promise<Partial<AiStay> | null> {
  const f = await callExtract(text, 'stay');
  if (!f) return null;
  return {
    name: f.name || '', city: f.city || '', address: f.address || '',
    checkIn: f.checkIn || '', checkOut: f.checkOut || '',
    confirmation: f.confirmation || '', cost: Number(f.cost) || 0, costCurrency: f.currency || '',
  };
}

export async function aiExtractActivity(text: string): Promise<Partial<AiActivity> | null> {
  const f = await callExtract(text, 'activity');
  if (!f) return null;
  return {
    title: f.title || '', provider: f.provider || '', date: f.date || '',
    startTime: f.startTime || '', endTime: f.endTime || '', location: f.location || '',
    confirmation: f.confirmation || '', cost: Number(f.cost) || 0, costCurrency: f.currency || '',
  };
}

/** Overlay AI fields onto the on-device parse: AI wins where it returned a
 *  value, the on-device result fills anything the AI left blank. */
export function mergePreferAi<T extends Record<string, any>>(base: T, ai: Partial<T> | null): T {
  if (!ai) return base;
  const out = { ...base };
  for (const k of Object.keys(ai) as (keyof T)[]) {
    const v = ai[k];
    if (v !== undefined && v !== '' && !(typeof v === 'number' && v === 0)) out[k] = v as T[keyof T];
  }
  return out;
}
