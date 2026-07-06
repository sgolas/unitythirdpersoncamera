/**
 * Shared image upload helper — compresses an image in the browser and uploads
 * it via the photo relay (same Supabase-backed endpoint the Photos tab uses),
 * returning the public URL. Used for trip photos and traveller profile pics.
 */
import { getSyncCode, getSyncPass, PHOTO_ENDPOINT } from './config';

export function compressToBase64(file: File, max = 1600, quality = 0.82): Promise<{ base64: string; type: string }> {
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
      const dataUrl = c.toDataURL('image/jpeg', quality);
      resolve({ base64: dataUrl.split(',')[1], type: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ base64: '', type: 'image/jpeg' }); };
    img.src = url;
  });
}

/** Compress an image file to a local `data:` URI (no network). Used for
 *  profile pictures and local-first trip photos — stored/synced in the record. */
export async function compressToDataUrl(file: File, max = 600, quality = 0.85): Promise<string> {
  const { base64, type } = await compressToBase64(file, max, quality);
  if (!base64) throw new Error('Could not read image');
  return `data:${type};base64,${base64}`;
}

/** Upload an image file and return its public URL. Throws with a clear message. */
export async function uploadImageFile(file: File, max = 1600, quality = 0.82): Promise<string> {
  const { base64, type } = await compressToBase64(file, max, quality);
  if (!base64) throw new Error('Could not read image');
  const res = await fetch(PHOTO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripCode: getSyncCode(), password: getSyncPass(),
      filename: file.name, contentType: type, dataBase64: base64,
    }),
  });
  if (res.status === 401) throw new Error('Wrong trip code or password (check Sync & Setup)');
  if (!res.ok) throw new Error('Upload failed — try again');
  const { url } = await res.json() as { url: string };
  return url;
}
