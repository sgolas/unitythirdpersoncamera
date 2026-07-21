/**
 * Supabase Realtime wrapper — live pub/sub for in-app multiplayer (the
 * artillery game). Uses ephemeral *broadcast* + *presence* channels only, so
 * nothing is written to the database. The anon key below is public by design
 * (every table has RLS enabled, so it grants no data access) and only lets a
 * client open Realtime channels. Rooms are namespaced by the trip code — the
 * family's existing shared secret — so only trip members find the room.
 *
 * @supabase/supabase-js is lazy-loaded so it never weighs down app startup.
 */
const SUPABASE_URL = 'https://zyqnaldaaqqdhnbqitjn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5cW5hbGRhYXFxZGhuYnFpdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjk0MTMsImV4cCI6MjA5Nzk0NTQxM30.jErR6aFth2ysgAttcE4rCIFNgD8iGEXMJwHFNAv1CXA';

type Client = import('@supabase/supabase-js').SupabaseClient;
type Channel = import('@supabase/supabase-js').RealtimeChannel;

let clientPromise: Promise<Client> | null = null;
async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(m =>
      m.createClient(SUPABASE_URL, SUPABASE_ANON, {
        realtime: { params: { eventsPerSecond: 30 } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }
  return clientPromise;
}

export interface Peer { id: string; [k: string]: unknown }

export interface Room {
  /** Broadcast an event to everyone in the room (including self). */
  send(event: string, payload: unknown): void;
  /** Listen for a broadcast event. Returns an unsubscribe fn. */
  on(event: string, cb: (payload: any) => void): () => void;
  /** Current presence peers (who's in the room). */
  peers(): Peer[];
  /** Listen for presence (join/leave) changes. Returns an unsubscribe fn. */
  onPeers(cb: (peers: Peer[]) => void): () => void;
  /** Update this client's presence metadata. */
  setMeta(meta: Record<string, unknown>): void;
  leave(): void;
}

/** Join a realtime room. `meta` is this client's presence info (must include a
 *  stable `id`). Resolves once subscribed and presence is tracked. */
export async function joinRoom(name: string, meta: Peer): Promise<Room> {
  const supabase = await getClient();
  const channel: Channel = supabase.channel(`room:${name}`, {
    config: { presence: { key: meta.id }, broadcast: { self: true, ack: false } },
  });

  const evHandlers = new Map<string, Set<(p: any) => void>>();
  const presHandlers = new Set<(peers: Peer[]) => void>();
  const emitPeers = () => {
    const state = channel.presenceState() as Record<string, Peer[]>;
    const peers = Object.values(state).map(arr => arr[0]).filter(Boolean);
    presHandlers.forEach(cb => cb(peers));
  };

  channel.on('presence', { event: 'sync' }, emitPeers);
  channel.on('presence', { event: 'join' }, emitPeers);
  channel.on('presence', { event: 'leave' }, emitPeers);
  channel.on('broadcast', { event: '*' }, (msg: any) => {
    const set = evHandlers.get(msg.event);
    if (set) set.forEach(cb => cb(msg.payload));
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime connect timed out')), 12000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); channel.track(meta).then(() => resolve()); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(status)); }
    });
  });

  return {
    send(event, payload) { channel.send({ type: 'broadcast', event, payload }); },
    on(event, cb) {
      if (!evHandlers.has(event)) evHandlers.set(event, new Set());
      evHandlers.get(event)!.add(cb);
      return () => evHandlers.get(event)?.delete(cb);
    },
    peers() {
      const state = channel.presenceState() as Record<string, Peer[]>;
      return Object.values(state).map(arr => arr[0]).filter(Boolean);
    },
    onPeers(cb) { presHandlers.add(cb); emitPeers(); return () => presHandlers.delete(cb); },
    setMeta(m) { channel.track({ ...meta, ...m }); },
    leave() { supabase.removeChannel(channel); },
  };
}
