/**
 * Shared helpers for the Pages Functions: locked CORS, salted+stretched
 * password hashing (with transparent upgrade from the old unsalted hashes),
 * and a Supabase-backed per-IP rate limiter.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Origins allowed to call the API from a browser (app WebView + portal). */
const ALLOWED_ORIGINS = [
  'https://trip.sgolas.com',
  'https://trip-planner-sgolas.pages.dev',
  'https://localhost',        // Capacitor Android (https scheme)
  'capacitor://localhost',    // Capacitor iOS
  'http://localhost',         // local dev
  'http://localhost:5174',
];

export function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Salted, PBKDF2-stretched password hash. The trip code is part of the salt,
 *  so every trip has a unique salt; `pepper` (server secret) adds another layer. */
export async function authHash(code: string, pass: string, pepper: string): Promise<string> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(`${code}::${pass}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`trip::${pepper}::${code}`), iterations: 100_000, hash: 'SHA-256' },
    km, 256,
  );
  return hex(bits);
}

/** The original unsalted SHA-256 hash — only used to migrate old records. */
async function legacyHash(code: string, pass: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${code}::${pass}`)));
}

export type AccessResult = 'ok' | 'wrong' | 'notfound' | 'created';

/**
 * Verify the trip code + password, upgrading any legacy unsalted hash to the
 * new salted one on a successful match. `allowClaim` lets the app create a new
 * trip code (the read-only portal must not).
 */
export async function verifyAccess(
  supabase: SupabaseClient, tripCode: string, password: string, pepper: string, allowClaim: boolean,
): Promise<AccessResult> {
  const { data: access } = await supabase
    .from('trip_access').select('password_hash').eq('trip_code', tripCode).maybeSingle();
  const fresh = await authHash(tripCode, password, pepper);
  if (!access) {
    if (!allowClaim) return 'notfound';
    await supabase.from('trip_access').insert({ trip_code: tripCode, password_hash: fresh });
    return 'created';
  }
  if (access.password_hash === fresh) return 'ok';
  if (access.password_hash === await legacyHash(tripCode, password)) {
    await supabase.from('trip_access').update({ password_hash: fresh }).eq('trip_code', tripCode);
    return 'ok';
  }
  return 'wrong';
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

/** Increment a counter and return its new value. Fails open (0) if unavailable. */
export async function bump(supabase: SupabaseClient, key: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('bump_rate', { p_key: key });
    if (error) return 0;
    return (data as number) ?? 0;
  } catch { return 0; }
}

/** True if this IP is over the general request budget for the current minute. */
export async function overRequestLimit(supabase: SupabaseClient, ip: string, perMinute = 60): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  return (await bump(supabase, `req:${ip}:${bucket}`)) > perMinute;
}

/**
 * Record a failed password attempt and report whether we should throttle.
 * We count failures two ways so neither axis can be evaded on its own:
 *   • per IP        — stops one host hammering many trips
 *   • per trip code — stops a *distributed* brute-force against one trip's
 *                     password (rotating IPs can't get past this).
 */
export async function overFailLimit(
  supabase: SupabaseClient, ip: string, tripCode: string,
  ipPer15Min = 20, tripPer15Min = 30,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 900_000);
  const byIp = await bump(supabase, `fail:${ip}:${bucket}`);
  const byTrip = await bump(supabase, `tripfail:${tripCode}:${bucket}`);
  return byIp > ipPer15Min || byTrip > tripPer15Min;
}
