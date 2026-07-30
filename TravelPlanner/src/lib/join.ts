/**
 * Scan a trip invite QR to join as a full syncing member.
 *
 * The host's invite QR encodes their trip code + password (as a
 * trip.sgolas.com/#t=CODE&k=PASS link, or a plain "code|pass"). Scanning it
 * here sets those as this device's sync credentials and pulls the trip down,
 * so the scanner becomes a full member — not just a read-only viewer.
 */
import { setSyncCredentials } from './config';
import { syncNow } from '../db/sync';
import { db } from '../db/database';
import { isNative } from './platform';

export interface JoinResult { ok: boolean; message: string }

/** Pull the trip code + password out of whatever the QR encodes. */
export function parseInvite(raw: string): { code: string; pass: string } | null {
  if (!raw) return null;
  // Prefer the hash/query of an invite URL.
  let params = '';
  try {
    const u = new URL(raw);
    params = (u.hash.replace(/^#/, '') || u.search.replace(/^\?/, ''));
  } catch {
    const m = raw.match(/[#?](.*)$/);
    params = m ? m[1] : '';
  }
  const p = new URLSearchParams(params);
  const code = p.get('t');
  const pass = p.get('k');
  if (code && pass) return { code: code.trim(), pass };
  // Fallback: a bare "code|pass" payload.
  const parts = raw.split('|');
  if (parts.length === 2 && parts[0].trim() && parts[1]) return { code: parts[0].trim(), pass: parts[1] };
  return null;
}

/**
 * Join an existing trip by a typed code + password (or a pasted invite link).
 * Works everywhere — the fallback for desktop/web where QR scanning isn't
 * available. Sets the credentials, syncs, and confirms the trip actually came
 * down before reporting success.
 */
export async function joinByCode(rawCode: string, pass: string): Promise<JoinResult> {
  const creds = parseInvite(rawCode) ?? (rawCode.trim() && pass ? { code: rawCode.trim(), pass } : null);
  if (!creds) return { ok: false, message: 'Enter both the trip code and password.' };

  setSyncCredentials(creds.code, creds.pass);
  const res = await syncNow();
  if (!res.ok) return { ok: false, message: res.message || 'Couldn’t connect — check the code and password.' };

  const trip = await db.trip.get('trip');
  if (!trip) return { ok: false, message: 'Connected, but that trip has no data yet. Open it on the original device and sync once, then try again.' };
  return { ok: true, message: 'Trip loaded ✓' };
}

/** Open the camera scanner, read a trip QR, join and sync. */
export async function scanToJoin(): Promise<JoinResult> {
  if (!isNative) return { ok: false, message: 'Scanning works in the installed app — on the web, enter the trip code instead.' };
  let raw = '';
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
    const sup = await BarcodeScanner.isSupported().catch(() => ({ supported: true }));
    if ((sup as { supported?: boolean }).supported === false) {
      return { ok: false, message: 'This phone can’t scan QR codes. Enter the trip code manually instead.' };
    }
    const res = await BarcodeScanner.scan();
    raw = res.barcodes?.[0]?.rawValue ?? '';
  } catch {
    return { ok: false, message: 'Scanner isn’t available yet — install the latest app version, or enter the trip code manually.' };
  }
  if (!raw) return { ok: false, message: 'No QR found — try again.' };
  const creds = parseInvite(raw);
  if (!creds) return { ok: false, message: 'That QR isn’t a trip invite.' };

  setSyncCredentials(creds.code, creds.pass);
  const res = await syncNow();
  if (!res.ok) return { ok: false, message: res.message || 'Joined, but couldn’t sync yet — it will sync automatically once you’re online.' };
  return { ok: true, message: 'Joined the trip ✓ Pulling everyone’s data…' };
}
