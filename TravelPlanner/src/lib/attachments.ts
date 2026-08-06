/**
 * Document attachments — read files (PDF or image) into data URLs, compress
 * images to keep IndexedDB small, and save/download an attachment to the
 * phone. Everything stays local-first; the file rides along with the synced
 * document record so the whole family gets it.
 */
import { isNative } from './platform';

/** Rough byte size of a base64 data URL. */
export function approxBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor(b64.length * 0.75);
}

/** Soft cap so a giant PDF can't bloat the synced record. */
export const MAX_ATTACH_BYTES = 12 * 1024 * 1024; // 12 MB

export function isPdf(mime?: string, name?: string): boolean {
  return (mime ?? '').includes('pdf') || /\.pdf$/i.test(name ?? '');
}

/** Read any file into a base64 data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Downscale an image to keep IndexedDB small (used for the card thumbnail). */
export function compressImageToDataUrl(file: File, max = 1400, quality = 0.8): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function sanitizeName(name: string): string {
  return (name || 'document').replace(/[^\w.\-]+/g, '_').slice(0, 80);
}

/**
 * Save an attachment to the phone (or download it in a browser).
 *  • Native  → tries the phone's public Download folder first (what users
 *    expect from a "download"); some Android versions block direct writes
 *    there, in which case it falls back to Documents/TripPlanner. Either way
 *    any Files app / PDF viewer can open it, and the message says where it went.
 *  • Web/portal → triggers a normal browser download.
 */
export async function saveToPhone(dataUrl: string, fileName: string): Promise<{ ok: boolean; message: string }> {
  const name = sanitizeName(fileName);
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const data = dataUrlToBase64(dataUrl);
      try {
        await Filesystem.writeFile({
          path: `Download/${name}`, directory: Directory.ExternalStorage, data, recursive: true,
        });
        return { ok: true, message: `Saved to your Download folder (Download/${name})` };
      } catch { /* scoped-storage variations — fall back to Documents */ }
      const dir = 'TripPlanner';
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true }).catch(() => {});
      await Filesystem.writeFile({ path: `${dir}/${name}`, directory: Directory.Documents, data });
      return { ok: true, message: `Saved to Documents/${dir}/${name}` };
    } catch (e) {
      return { ok: false, message: 'Could not save the file: ' + String(e) };
    }
  }
  // Browser download.
  try {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    return { ok: true, message: 'Downloaded ' + name };
  } catch {
    return { ok: false, message: 'Could not download the file.' };
  }
}
