import { useState, useRef } from 'react';
import { Camera, MapPin, Trash2, FolderOpen, Grid3x3, Loader, Navigation } from 'lucide-react';
import { usePhotos } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { TripPhoto } from '../../types';
import { fmtStamp, todayStr } from '../../utils/format';
import { getSyncCode, getSyncPass, isSyncConfigured, PHOTO_ENDPOINT } from '../../lib/config';
import { TabHeader, Sheet, Field, TextInput, FormFooter, EmptyState, Fab, ConfirmDelete } from '../ui';
import { PlaceInput } from '../PlaceInput';

/* Compress an image and return base64 (no data: prefix) for upload. */
function compressToBase64(file: File): Promise<{ base64: string; type: string }> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.82);
      resolve({ base64: dataUrl.split(',')[1], type: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ base64: '', type: 'image/jpeg' }); };
    img.src = url;
  });
}

type View = 'all' | 'folders';

export function PhotosTab() {
  const photos = usePhotos();
  const [view, setView] = useState<View>('folders');
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Group into folders.
  const folders = Array.from(new Set(photos.map(p => p.folder))).sort().reverse();
  const shown = openFolder ? photos.filter(p => p.folder === openFolder) : photos;

  function pickFile() { fileRef.current?.click(); }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
    e.target.value = '';
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Photos" subtitle={`${photos.length} uploaded`}
        gradient="linear-gradient(135deg,#be185d,#ec4899)" icon="📸" />

      {!isSyncConfigured() && (
        <div className="m-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          📶 Set up a <b>trip code + password</b> in <b>Sync &amp; Setup</b> first — photos upload online using it.
        </div>
      )}

      {/* view toggle + folder breadcrumb */}
      <div className="flex items-center justify-between px-4 pt-3">
        {openFolder ? (
          <button onClick={() => setOpenFolder(null)} className="text-sm font-semibold text-pink-600 flex items-center gap-1">
            ‹ All folders
          </button>
        ) : (
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setView('folders')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 ${view === 'folders' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              <FolderOpen size={14} /> Folders
            </button>
            <button onClick={() => setView('all')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 ${view === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              <Grid3x3 size={14} /> All
            </button>
          </div>
        )}
        <span className="text-xs text-slate-400">{shown.length} photo{shown.length === 1 ? '' : 's'}</span>
      </div>

      {photos.length === 0 ? (
        <EmptyState emoji="📸" title="No photos yet" hint="Upload trip photos — they're stamped with time & place and saved online" />
      ) : view === 'folders' && !openFolder ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          {folders.map(f => {
            const inF = photos.filter(p => p.folder === f);
            const cover = inF[0];
            return (
              <button key={f} onClick={() => setOpenFolder(f)}
                className="rounded-2xl overflow-hidden bg-white shadow-sm text-left active:scale-[0.98] transition">
                <div className="aspect-square bg-slate-100">
                  {cover && <img src={cover.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="p-2.5">
                  <p className="font-semibold text-slate-800 text-sm truncate">📁 {f}</p>
                  <p className="text-xs text-slate-400">{inF.length} photo{inF.length === 1 ? '' : 's'}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 p-3">
          {shown.map(p => (
            <div key={p.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                <img src={p.url} alt={p.caption} className="w-full h-full object-cover" loading="lazy" />
              </a>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4">
                {p.place && <p className="text-white text-[9px] font-medium flex items-center gap-0.5 leading-tight"><MapPin size={8} />{p.place}</p>}
                <p className="text-white/80 text-[8px] leading-tight">{fmtStamp(p.takenAt)}</p>
              </div>
              <button onClick={() => setPendingDelete(p)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <Trash2 size={11} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      {isSyncConfigured() && <Fab onClick={pickFile} label="Add photo" />}

      {pendingFile && (
        <UploadSheet file={pendingFile}
          defaultFolder={openFolder ?? todayStr()}
          onClose={() => setPendingFile(null)} />
      )}
      {pendingDelete && (
        <ConfirmDelete label="This photo (stays in cloud storage)"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('photo', pendingDelete.id, `Removed a photo`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function UploadSheet({ file, defaultFolder, onClose }: { file: File; defaultFolder: string; onClose: () => void }) {
  const [preview] = useState(() => URL.createObjectURL(file));
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [folder, setFolder] = useState(defaultFolder);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [locating, setLocating] = useState(false);

  function useMyLocation() {
    if (!navigator.geolocation) { setErr('Device location isn’t available — search a place above instead.'); return; }
    setLocating(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setErr('Device location is off for this app — search a place above to tag it instead.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function upload() {
    setBusy(true); setErr('');
    try {
      const { base64, type } = await compressToBase64(file);
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

      await put<TripPhoto>({
        kind: 'photo', id: crypto.randomUUID(), url,
        caption: caption.trim(), place: place.trim(),
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        takenAt: new Date().toISOString(), folder: folder.trim() || todayStr(),
        updatedAt: '', updatedBy: '',
      }, `Added a photo${place ? ' at ' + place.trim() : ''}`, 'create');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setBusy(false);
  }

  return (
    <Sheet title="Upload photo" onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={upload} disabled={busy} submitLabel={busy ? 'Uploading…' : 'Upload'} />}>
      <img src={preview} alt="" className="w-full max-h-56 object-contain rounded-2xl bg-slate-50 mb-4" />
      <Field label="Caption"><TextInput autoFocus value={caption} onChange={e => setCaption(e.target.value)} placeholder="Optional" /></Field>
      <Field label="Location / place">
        <PlaceInput value={place}
          onChange={v => { setPlace(v); setCoords(null); }}
          onPick={(c) => setCoords(c)}
          placeholder="Search a place, e.g. Eiffel Tower" />
      </Field>
      <div className="flex items-center gap-2 -mt-1 mb-2">
        <button onClick={useMyLocation} disabled={locating}
          className="px-3 py-1.5 rounded-xl bg-pink-50 text-pink-600 font-semibold text-xs flex items-center gap-1">
          {locating ? <Loader size={13} className="animate-spin" /> : <Navigation size={13} />} Use my location
        </button>
        {coords && <span className="text-xs text-mint">📍 Tagged {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>}
      </div>
      <Field label="Folder"><TextInput value={folder} onChange={e => setFolder(e.target.value)} placeholder="YYYY-MM-DD or a place" /></Field>
      {busy && (
        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1"><Loader size={15} className="animate-spin" /> Uploading online…</div>
      )}
      {err && <p className="text-sunset text-sm mt-1">{err}</p>}
      <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Camera size={12} /> Stamped {new Date().toLocaleString()}</p>
    </Sheet>
  );
}
