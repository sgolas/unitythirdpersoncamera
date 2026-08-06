/**
 * Offline translator — on-device text translation via ML Kit
 * (@capacitor-mlkit/translation). Each language downloads a small model once
 * over the network, then translates fully offline (airplane mode, dead zones
 * abroad — all fine). Text only. Native app only.
 *
 * ML Kit's Language enum values ARE the ISO 639-1 codes, so we can drive it
 * straight from the master VOICE_LANGS list — every language we offer is
 * available offline.
 */
import { Capacitor } from '@capacitor/core';
import { VOICE_LANGS } from './phrasebook';

export type Lang = string; // ISO 639-1 code

/** All languages that can be downloaded for offline translation. */
export const LANGS: { code: Lang; name: string; flag: string }[] =
  VOICE_LANGS.map(l => ({ code: l.code, name: l.name, flag: l.flag }));

export const langName = (l: Lang) => VOICE_LANGS.find(x => x.code === l)?.name ?? l;

/** True when the on-device translator is usable (native build with plugin). */
export function translationAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Translation'); }
  catch { return false; }
}

async function mod() {
  return await import('@capacitor-mlkit/translation');
}

// The ML Kit Language enum is a string enum whose values are the ISO codes,
// so a plain code string is a valid enum value at runtime.
type MlkitLang = Awaited<ReturnType<typeof mod>>['Language'][keyof Awaited<ReturnType<typeof mod>>['Language']];
const asLang = (code: Lang) => code as unknown as MlkitLang;

/** Which language models are already downloaded (offline-ready). */
export async function downloadedLangs(): Promise<Lang[]> {
  if (!translationAvailable()) return [];
  try {
    const m = await mod();
    const r = await m.Translation.getDownloadedModels();
    return (r.languages as unknown as Lang[]) ?? [];
  } catch { return []; }
}

/** Download a language model (needs a connection this once). */
export async function downloadLang(l: Lang): Promise<void> {
  const m = await mod();
  await m.Translation.downloadModel({ language: asLang(l) });
}

/** Remove a downloaded language model to free space. */
export async function removeLang(l: Lang): Promise<void> {
  const m = await mod();
  await m.Translation.deleteDownloadedModel({ language: asLang(l) });
}

/** Best-effort: open this app's page in Android Settings (troubleshooting). */
export function openPhoneSettings() {
  try {
    window.open(
      'intent://com.sgolas.tripplanner#Intent;scheme=package;action=android.settings.APPLICATION_DETAILS_SETTINGS;end',
      '_system',
    );
  } catch { /* not on a device */ }
}

/** Translate text between two languages. Throws with a friendly message. */
export async function translateText(text: string, from: Lang, to: Lang): Promise<string> {
  if (!translationAvailable()) throw new Error('The translator is only available in the app (v1.5+).');
  const m = await mod();
  const r = await m.Translation.translate({
    text, sourceLanguage: asLang(from), targetLanguage: asLang(to),
  });
  return r.text;
}
