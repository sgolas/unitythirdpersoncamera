/**
 * Text translation — Cloudflare Pages Function proxying Google's free
 * translate endpoint (no API key, no billing). Kept server-side so the app
 * avoids CORS and we can rate-limit. Used by the voice translator.
 *
 * POST { q: string, from?: string ('auto'), to: string }  → { text, from }
 */
import { createClient } from '@supabase/supabase-js';
import { cors, clientIp, overRequestLimit } from './_shared';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    if (await overRequestLimit(supabase, clientIp(request), 60)) return json({ error: 'Too many requests' }, 429);
  }

  try {
    const { q, from, to } = await request.json() as { q?: string; from?: string; to?: string };
    const text = (q ?? '').trim();
    if (!text || !to) return json({ error: 'Missing text or target language' }, 400);
    if (text.length > 1000) return json({ error: 'Too long' }, 400);

    const sl = from || 'auto';

    // 1) Google's free endpoint — best quality, but rate-limits shared IPs.
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx`
        + `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
      if (r.ok) {
        const data = await r.json() as [Array<[string, string]>, unknown, string];
        const translated = (data[0] ?? []).map(seg => seg[0]).join('');
        if (translated) return json({ text: translated, from: data[2] || sl });
      }
    } catch { /* fall through to MyMemory */ }

    // 2) MyMemory — free fallback (needs a concrete source language). May be
    //    rate-limited from shared server IPs; the app translates device-side.
    if (sl !== 'auto') {
      try {
        const mm = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sl}|${to}`;
        const r2 = await fetch(mm, { headers: { Accept: 'application/json' } });
        if (r2.ok) {
          const d = await r2.json() as { responseData?: { translatedText?: string }; responseStatus?: number };
          const t = d.responseData?.translatedText;
          if (t && d.responseStatus === 200 && !/^MYMEMORY WARNING/i.test(t)) return json({ text: t, from: sl });
        }
      } catch { /* unavailable */ }
    }

    // 3) Official Google Cloud Translation — only if a key is configured
    //    (reliable/paid); the free paths above cover the common case.
    const gkey = (env as Env & { GOOGLE_TRANSLATE_KEY?: string }).GOOGLE_TRANSLATE_KEY;
    if (gkey) {
      try {
        const r3 = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${gkey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, target: to, ...(sl !== 'auto' ? { source: sl } : {}) }),
        });
        if (r3.ok) {
          const d = await r3.json() as { data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] } };
          const tr = d.data?.translations?.[0];
          if (tr?.translatedText) return json({ text: tr.translatedText, from: tr.detectedSourceLanguage || sl });
        }
      } catch { /* unavailable */ }
    }

    return json({ error: 'Translation service unavailable' }, 502);
  } catch (err) {
    return json({ error: 'Translation failed', detail: String(err) }, 500);
  }
};
