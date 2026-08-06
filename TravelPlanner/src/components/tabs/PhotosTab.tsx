import { useState, useRef } from 'react';
import { MapPin, Trash2, FolderOpen, Grid3x3, Loader, ImagePlus } from 'lucide-react';
import { usePhotos } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { TripPhoto } from '../../types';
import { fmtStamp, todayStr } from '../../utils/format';
import { isSyncConfigured } from '../../lib/config';
import { TabHeader, Sheet, Field, TextInput, FormFooter, EmptyState, Fab, ConfirmDelete } from '../ui';

/** The image source for a photo record — local data first, legacy URL fallback. */
function srcOf(p: TripPhoto): string { return p.data || p.url || ''; }

/** Quick folder suggestions that match the "important trip stuff" use case. */
const FOLDER_CHIPS = ['Documents', 'Tickets', 'Bills', 'Recipes', 'Places', 'General'];

/* Compress an image on-device and return a data: URI (stored + synced). */
function compressToDataUrl(file: File, max = 1500, quality = 0.72): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

type View = 'all' | 'folders';

export function PhotosTab() {
  const photos = usePhotos();
  const [view, setView] = useState<View>('folders');
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const folders = Array.from(new Set(photos.map(p => p.folder))).sort().reverse();
  const shown = openFolder ? photos.filter(p => p.folder === openFolder) : photos;

  function pickFiles() { fileRef.current?.click(); }
  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setPendingFiles(files);
    e.target.value = '';
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Photos & Files" subtitle={`${photos.length} saved`}
        gradient="linear-gradient(135deg,#be185d,#ec4899)" icon="🗂️" />

      <div className="mx-4 mt-4 p-3 rounded-2xl bg-pink-50 border border-pink-100 text-pink-900 text-sm">
        📎 Save documents, tickets, bills, recipes or any picture the group needs. Everything stays <b>on your device</b>
        {isSyncConfigured() ? <> and is shared when you tap <b>Sync</b> — everyone gets their own copy.</> : <>. Set up <b>Share</b> in Sync &amp; Setup to send them to the group.</>}
      </div>

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
        <span className="text-xs text-slate-400">{shown.length} item{shown.length === 1 ? '' : 's'}</span>
      </div>

      {photos.length === 0 ? (
        <EmptyState emoji="🗂️" title="Nothing saved yet"
          hint="Add photos of documents, tickets, bills, recipes or places — kept on your device and shared with your group when you sync." />
      ) : view === 'folders' && !openFolder ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          {folders.map(f => {
            const inF = photos.filter(p => p.folder === f);
            const cover = inF[0];
            return (
              <button key={f} onClick={() => setOpenFolder(f)}
                className="rounded-2xl overflow-hidden bg-white shadow-sm text-left active:scale-[0.98] transition">
                <div className="aspect-square bg-slate-100">
                  {cover && <img src={srcOf(cover)} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="p-2.5">
                  <p className="font-semibold text-slate-800 text-sm truncate">📁 {f}</p>
                  <p className="text-xs text-slate-400">{inF.length} item{inF.length === 1 ? '' : 's'}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 p-3">
          {shown.map(p => (
            <div key={p.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100">
              <a href={srcOf(p)} target="_blank" rel="noopener noreferrer">
                <img src={srcOf(p)} alt={p.caption} className="w-full h-full object-cover" loading="lazy" />
              </a>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4">
                {p.caption && <p className="text-white text-[9px] font-medium leading-tight truncate">{p.caption}</p>}
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

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <Fab onClick={pickFiles} label="Add photos" />

      {pendingFiles && (
        <ImportSheet files={pendingFiles}
          defaultFolder={openFolder ?? 'General'}
          onClose={() => setPendingFiles(null)} />
      )}
      {pendingDelete && (
        <ConfirmDelete label="This item"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('photo', pendingDelete.id, `Removed a saved item`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function ImportSheet({ files, defaultFolder, onClose }: { files: File[]; defaultFolder: string; onClose: () => void }) {
  const [previews] = useState(() => files.slice(0, 6).map(f => URL.createObjectURL(f)));
  const [caption, setCaption] = useState('');
  const [folder, setFolder] = useState(defaultFolder);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [err, setErr] = useState('');
  const many = files.length > 1;

  async function save() {
    setBusy(true); setErr(''); setDone(0);
    const target = folder.trim() || 'General';
    try {
      for (let i = 0; i < files.length; i++) {
        const data = await compressToDataUrl(files[i]);
        if (!data) continue; // skip unreadable file, keep going
        await put<TripPhoto>({
          kind: 'photo', id: crypto.randomUUID(), data,
          caption: caption.trim(), place: '', lat: null, lng: null,
          takenAt: new Date().toISOString(), folder: target,
          updatedAt: '', updatedBy: '',
        }, `Saved a photo to ${target}`, 'create');
        setDone(i + 1);
      }
      onClose();
    } catch {
      setErr('Something went wrong saving. The ones that finished are kept — try the rest again.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={many ? `Add ${files.length} photos` : 'Add photo'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={busy}
        submitLabel={busy ? `Saving ${done}/${files.length}…` : many ? `Save ${files.length}` : 'Save'} />}>
      {/* Preview strip */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 pb-1">
        {previews.map((src, i) => (
          <img key={i} src={src} alt="" className="w-24 h-24 flex-shrink-0 object-cover rounded-xl bg-slate-50" />
        ))}
        {files.length > previews.length && (
          <div className="w-24 h-24 flex-shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
            +{files.length - previews.length}
          </div>
        )}
      </div>

      <Field label="Folder">
        <TextInput value={folder} onChange={e => setFolder(e.target.value)} placeholder="e.g. Documents" />
      </Field>
      <div className="flex flex-wrap gap-2 -mt-1 mb-3">
        {FOLDER_CHIPS.map(c => (
          <button key={c} onClick={() => setFolder(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${folder === c ? 'bg-ink text-white border-ink' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {c}
          </button>
        ))}
        <button onClick={() => setFolder(todayStr())}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${folder === todayStr() ? 'bg-ink text-white border-ink' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
          Today
        </button>
      </div>

      <Field label={`Label ${many ? '(applied to all, optional)' : '(optional)'}`}>
        <TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Hotel booking, Train ticket…" />
      </Field>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1"><Loader size={15} className="animate-spin" /> Saving on your device…</div>
      )}
      {err && <p className="text-sunset text-sm mt-1">{err}</p>}
      <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
        <ImagePlus size={13} /> Stored on this device{isSyncConfigured() ? ' · shared when you Sync' : ''}
      </p>
    </Sheet>
  );
}
