/**
 * Sync relay — Cloudflare Pages Function version (Workers runtime).
 *
 * Same behaviour as the Netlify function: devices POST their full record set;
 * we merge last-write-wins into Supabase `trip_sync` and return the
 * authoritative set. Password-gated per shared trip code.
 *
 * Auth, CORS and rate limiting live in ./_shared. Env vars (Cloudflare Pages →
 * Settings → Environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, AUTH_SALT
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cors, verifyAccess, clientIp, overRequestLimit, overFailLimit } from './_shared';
import { sendPush } from './_fcm';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AUTH_SALT: string;
  FCM_SERVICE_ACCOUNT?: string; // Firebase service-account JSON (enables push)
}

interface ChatPayload { text?: string; author?: string; emoji?: string; deviceId?: string }

/**
 * Push a notification to the trip's *other* devices when brand-new chat
 * messages arrive. Best-effort and fire-and-forget (runs in ctx.waitUntil):
 * looks up registered FCM tokens, skips the sender(s), sends, and prunes any
 * tokens FCM reports as dead.
 */
async function pushNewChat(
  supabase: SupabaseClient, serviceAccount: string, tripCode: string,
  chats: ChatPayload[],
) {
  const senderIds = new Set(chats.map(c => c.deviceId).filter(Boolean) as string[]);
  const { data: rows } = await supabase
    .from('push_tokens').select('device_id, token').eq('trip_code', tripCode);
  const targets = (rows ?? []).filter(r => !senderIds.has(r.device_id));
  if (!targets.length) return;

  let title: string, body: string;
  if (chats.length === 1) {
    const c = chats[0];
    title = `${c.emoji || '💬'} ${c.author || 'New message'}`;
    body = (c.text || '').slice(0, 140) || 'sent a message';
  } else {
    title = '💬 New messages';
    body = `${chats.length} new messages in the family chat.`;
  }

  const { dead } = await sendPush(serviceAccount, targets.map(t => t.token), { title, body }, { kind: 'chat' });
  if (dead.length) {
    await supabase.from('push_tokens').delete().eq('trip_code', tripCode).in('token', dead);
  }
}

export const onRequestOptions: PagesFunction = (ctx) =>
  new Response('', { headers: cors(ctx.request.headers.get('Origin')) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const headers = cors(request.headers.get('Origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
    return json({ error: 'Sync backend not configured' }, 500);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const ip = clientIp(request);
  if (await overRequestLimit(supabase, ip)) return json({ error: 'Too many requests' }, 429);

  try {
    const { tripCode, password, device, records, readOnly, since } = await request.json() as {
      tripCode: string; password: string; device?: string;
      records?: Array<{ entity: string; record_id: string; updated_at: string; payload: unknown }>;
      readOnly?: boolean;
      // Download cursor: only return records synced after this server-side
      // timestamp. Omitted → full set (first sync, older clients, portal).
      since?: string;
    };

    if (!tripCode || !password) return json({ error: 'Missing trip code or password' }, 400);

    // The read-only portal must never create a trip — only the app claims a code.
    const access = await verifyAccess(supabase, tripCode, password, env.AUTH_SALT, !readOnly);
    if (access === 'notfound') return json({ error: 'no-trip' }, 404);
    if (access === 'wrong') {
      if (await overFailLimit(supabase, ip, tripCode)) return json({ error: 'Too many attempts' }, 429);
      return json({ error: 'Wrong trip code or password' }, 401);
    }

    let accepted = 0;
    if (!readOnly && Array.isArray(records) && records.length) {
      const { data: existing } = await supabase
        .from('trip_sync').select('entity, record_id, updated_at').eq('trip_code', tripCode);
      const stored = new Map<string, string>();
      (existing ?? []).forEach(r => stored.set(`${r.entity}:${r.record_id}`, r.updated_at));

      const winners = records.filter(r => {
        const prev = stored.get(`${r.entity}:${r.record_id}`);
        return !prev || r.updated_at > prev;
      }).map(r => ({
        trip_code: tripCode, entity: r.entity, record_id: r.record_id,
        updated_at: r.updated_at, updated_by: device ?? 'unknown', payload: r.payload,
        // Server-side change stamp — the download cursor is driven by this
        // (single writer fleet, so one consistent clock for ordering).
        synced_at: new Date().toISOString(),
      }));

      if (winners.length) {
        await supabase.from('trip_sync').upsert(winners, { onConflict: 'trip_code,entity,record_id' });
        accepted = winners.length;

        // Push a notification to the family for brand-new chat messages
        // (winners are strictly-newer records, so edits/re-sends don't re-ping).
        const newChat = winners
          .filter(w => w.entity === 'chatmsg' && !stored.has(`chatmsg:${w.record_id}`))
          .map(w => w.payload as ChatPayload);
        if (newChat.length && env.FCM_SERVICE_ACCOUNT) {
          ctx.waitUntil(pushNewChat(supabase, env.FCM_SERVICE_ACCOUNT, tripCode, newChat).catch(() => {}));
        }
      }
    }

    // Delta download: with a `since` cursor return only rows synced after it;
    // without one (first sync / older clients / portal) return the full set.
    let query = supabase
      .from('trip_sync').select('entity, record_id, updated_at, payload').eq('trip_code', tripCode);
    if (since) query = query.gt('synced_at', since);
    const { data: rows } = await query;

    // Don't echo back the records this request just pushed — the client already
    // has them, and with attachments they can be many MB. Only skip an exact
    // (entity, record_id, updated_at) match, so a concurrent newer edit from
    // another device still flows through. Timestamps compare as epoch millis
    // because Postgres reformats the ISO string (e.g. ".430Z" → ".43+00:00").
    const key = (e: string, id: string, at: string) => `${e}:${id}:${Date.parse(at)}`;
    const pushedKeys = new Set(
      (Array.isArray(records) ? records : []).map(r => key(r.entity, r.record_id, r.updated_at)),
    );
    const out = (rows ?? []).filter(r => !pushedKeys.has(key(r.entity, r.record_id, r.updated_at)));

    // Next cursor = the trip's max synced_at (never "now": a concurrently
    // committing row can't be skipped past, and re-delivery is harmless because
    // the client merge is idempotent last-write-wins).
    const { data: maxRow } = await supabase
      .from('trip_sync').select('synced_at').eq('trip_code', tripCode)
      .order('synced_at', { ascending: false }).limit(1).maybeSingle();
    const cursor = maxRow?.synced_at ?? since ?? null;

    return json({ accepted, records: out, cursor });
  } catch (err) {
    return json({ error: 'Sync failed', detail: String(err) }, 500);
  }
};
