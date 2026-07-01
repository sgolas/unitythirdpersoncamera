/**
 * Photo upload — Cloudflare Pages Function.
 *
 * The app POSTs a compressed image (base64) with the trip code + password.
 * We verify the password against trip_access, upload the bytes to the public
 * `tripphotos` bucket via the Supabase service key (server-side only), and
 * return the public URL. The app then stores the photo's metadata in the
 * synced `photos` table so it appears on every device and in the portal.
 */
import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

async function hash(code: string, pass: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${code}::${pass}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const onRequestOptions: PagesFunction = () => new Response('', { headers: CORS });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return json({ error: 'Storage not configured' }, 500);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { tripCode, password, filename, contentType, dataBase64 } = await request.json() as {
      tripCode: string; password: string; filename: string; contentType: string; dataBase64: string;
    };
    if (!tripCode || !password || !dataBase64) return json({ error: 'Missing fields' }, 400);

    // Verify or claim the trip password (same gate as sync).
    const pwHash = await hash(tripCode, password);
    const { data: access } = await supabase
      .from('trip_access').select('password_hash').eq('trip_code', tripCode).maybeSingle();
    if (!access) {
      await supabase.from('trip_access').insert({ trip_code: tripCode, password_hash: pwHash });
    } else if (access.password_hash !== pwHash) {
      return json({ error: 'Wrong trip code or password' }, 401);
    }

    const safeName = (filename || `photo_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${tripCode}/${Date.now()}_${safeName}`;
    const bytes = b64ToBytes(dataBase64);

    const { error: upErr } = await supabase.storage
      .from('tripphotos')
      .upload(path, bytes, { contentType: contentType || 'image/jpeg', upsert: true });
    if (upErr) return json({ error: 'Upload failed', detail: upErr.message }, 500);

    const { data: pub } = supabase.storage.from('tripphotos').getPublicUrl(path);
    return json({ url: pub.publicUrl });
  } catch (err) {
    return json({ error: 'Photo upload failed', detail: String(err) }, 500);
  }
};
