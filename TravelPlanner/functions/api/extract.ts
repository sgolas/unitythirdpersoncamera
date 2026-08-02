/**
 * AI booking extraction — Cloudflare Pages Function using Workers AI (no API
 * key; billed to the Cloudflare account's free tier). The app extracts the PDF
 * text on-device and posts it here; we ask a model to return the booking as
 * JSON. Rate-limited like the other functions; the app always falls back to its
 * on-device parser if this is unavailable, so import never depends on it.
 *
 * POST { text: string, kind: 'activity' | 'stay' }  → { fields: {...} }
 */
import { createClient } from '@supabase/supabase-js';
import { cors, clientIp, overRequestLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AI?: { run: (model: string, inputs: unknown) => Promise<{ response?: string } | string> };
}

// Tried in order; the first available one wins (survives model deprecations).
const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fast',
];

const FIELDS: Record<string, string[]> = {
  activity: ['title', 'provider', 'date', 'startTime', 'endTime', 'location', 'confirmation', 'cost', 'currency'],
  stay: ['name', 'city', 'address', 'checkIn', 'checkOut', 'confirmation', 'cost', 'currency'],
};

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    // AI calls are the pricier ones — keep the per-IP budget tight.
    if (await overRequestLimit(supabase, clientIp(request), 40)) return json({ error: 'Too many requests' }, 429);
  }

  if (!env.AI) return json({ error: 'AI not configured' }, 503);

  try {
    const { text, kind } = await request.json() as { text?: string; kind?: string };
    const body = (text ?? '').slice(0, 9000).trim();
    const keys = FIELDS[kind === 'stay' ? 'stay' : 'activity'];
    if (!body) return json({ error: 'No text' }, 400);

    const what = kind === 'stay' ? 'a lodging/accommodation booking' : 'a booked activity, tour, ticket or restaurant reservation';
    const sys = [
      `You extract structured details from the text of ${what} confirmation.`,
      `Return ONLY a JSON object with exactly these keys: ${keys.join(', ')}.`,
      `Rules: dates as "YYYY-MM-DD"; times as 24-hour "HH:MM"; currency as a 3-letter ISO code (e.g. EUR, USD, CAD); cost as a number (the final total actually paid, after any discount) or 0 if none is shown.`,
      `Use "" for any text field you cannot find. Do NOT invent values. Prefer the main booking's own details over addresses of the operator/agency.`,
    ].join(' ');

    const messages = [{ role: 'system', content: sys }, { role: 'user', content: body }];
    const debug = new URL(request.url).searchParams.get('debug') === '1';
    const attempts: Record<string, string> = {};
    let lastErr = '';
    for (const model of MODELS) {
      try {
        const out = await env.AI.run(model, { messages, response_format: { type: 'json_object' }, max_tokens: 400, temperature: 0 });
        const raw = typeof out === 'string' ? out : (out.response ?? '');
        const parsed = pickJson(raw);
        if (Object.keys(parsed).length === 0) { attempts[model] = 'empty'; lastErr = 'empty'; continue; }
        if (debug) { attempts[model] = 'OK'; return json({ ok: model, attempts, fields: coerce(parsed, keys) }); }
        return json({ fields: coerce(parsed, keys), model });
      } catch (e) { attempts[model] = String(e).slice(0, 80); lastErr = String(e); }
    }
    return json({ error: 'Extraction failed', detail: lastErr, ...(debug ? { attempts } : {}) }, 502);
  } catch (err) {
    return json({ error: 'Extraction failed', detail: String(err) }, 500);
  }
};

/** Pull the first JSON object out of the model's reply (it may wrap it in prose). */
function pickJson(s: string): Record<string, unknown> {
  if (typeof s !== 'string') return {};
  try { return JSON.parse(s); } catch { /* try to slice a {...} */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* give up */ } }
  return {};
}

/** Keep only the expected keys, normalise types, drop obvious junk. */
function coerce(obj: Record<string, unknown>, keys: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of keys) {
    const v = obj[k];
    if (k === 'cost') { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); out[k] = Number.isFinite(n) ? n : 0; continue; }
    let s = v == null ? '' : String(v).trim();
    if (/^(n\/?a|none|null|unknown|not found|-)$/i.test(s)) s = '';
    if ((k === 'date' || k === 'checkIn' || k === 'checkOut') && !/^\d{4}-\d{2}-\d{2}$/.test(s)) s = '';
    if ((k === 'startTime' || k === 'endTime') && !/^\d{1,2}:\d{2}$/.test(s)) s = '';
    if (k === 'currency') s = /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : '';
    out[k] = s;
  }
  return out;
}
