/**
 * Offline translator — English ↔ Italian / Polish, via ML Kit on-device
 * translation (@capacitor-mlkit/translation). Each language downloads a ~30 MB
 * model once over the network, then translates fully offline (airplane mode,
 * dead zones abroad — all fine). Text only. Native app only.
 */
import { Capacitor } from '@capacitor/core';

export type Lang = 'en' | 'it' | 'pl';
export const LANGS: { code: Lang; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pl', name: 'Polish',  flag: '🇵🇱' },
];
export const langName = (l: Lang) => LANGS.find(x => x.code === l)?.name ?? l;

/** True when the on-device translator is usable (native build with plugin). */
export function translationAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Translation'); }
  catch { return false; }
}

async function mod() {
  return await import('@capacitor-mlkit/translation');
}
async function toEnum(l: Lang) {
  const m = await mod();
  return { en: m.Language.English, it: m.Language.Italian, pl: m.Language.Polish }[l];
}

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
  await m.Translation.downloadModel({ language: await toEnum(l) });
}

/** Remove a downloaded language model to free space. */
export async function removeLang(l: Lang): Promise<void> {
  const m = await mod();
  await m.Translation.deleteDownloadedModel({ language: await toEnum(l) });
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
    text, sourceLanguage: await toEnum(from), targetLanguage: await toEnum(to),
  });
  return r.text;
}
