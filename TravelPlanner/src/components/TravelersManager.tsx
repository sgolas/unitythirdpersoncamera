import { useState, useRef } from 'react';
import { Users, Plus, Pencil, Trash2, Upload, Loader, X } from 'lucide-react';
import { useTravelers } from '../hooks/useTrip';
import { put, remove } from '../db/database';
import type { Traveler } from '../types';
import { isSyncConfigured } from '../lib/config';
import { uploadImageFile } from '../lib/photoUpload';
import { Sheet, Field, TextInput, Select, FormFooter, ConfirmDelete } from './ui';

const EMOJIS = ['🧑', '👩', '👨', '🧒', '👧', '👦', '👶', '👴', '👵', '🧕', '🧑‍🦱', '🧑‍🦰', '🧑‍🦳', '🐶'];

/** Round avatar showing the profile picture if set, else the emoji. */
export function Avatar({ traveler, size = 44 }: { traveler: Pick<Traveler, 'emoji' | 'photo' | 'name'>; size?: number }) {
  return (
    <span className="rounded-full overflow-hidden flex items-center justify-center bg-slate-100 flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {traveler.photo
        ? <img src={traveler.photo} alt={traveler.name} className="w-full h-full object-cover" />
        : <span>{traveler.emoji}</span>}
    </span>
  );
}

export function TravelersManager() {
  const travelers = useTravelers();
  const [editing, setEditing] = useState<Traveler | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Traveler | null>(null);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="flex items-center gap-2 font-semibold text-slate-800 mb-1"><Users size={16} /> Travellers</p>
      <p className="text-xs text-slate-400 mb-3">Add or remove people on the trip and give each a profile picture.</p>

      <div className="space-y-2">
        {travelers.map(t => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <Avatar traveler={t} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate">{t.name}</p>
              <p className="text-xs text-slate-400 capitalize">{t.role}</p>
            </div>
            <button onClick={() => setEditing(t)} aria-label="Edit" className="p-2 rounded-lg text-slate-400 active:bg-slate-200">
              <Pencil size={16} />
            </button>
            <button onClick={() => setPendingDelete(t)} aria-label="Remove"
              disabled={travelers.length <= 1}
              className="p-2 rounded-lg text-slate-400 active:bg-rose-100 disabled:opacity-30">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => setEditing('new')}
        className="w-full mt-3 py-2.5 rounded-2xl font-semibold text-accent border-2 border-dashed border-line active:bg-slate-50 transition flex items-center justify-center gap-1.5">
        <Plus size={16} /> Add person
      </button>

      {editing && (
        <TravelerSheet traveler={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('traveler', pendingDelete.id, `Removed ${pendingDelete.name} from the trip`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function TravelerSheet({ traveler, onClose }: { traveler: Traveler | null; onClose: () => void }) {
  const [name, setName] = useState(traveler?.name ?? '');
  const [role, setRole] = useState<'adult' | 'child'>(traveler?.role ?? 'adult');
  const [emoji, setEmoji] = useState(traveler?.emoji ?? '🧑');
  const [photo, setPhoto] = useState<string | undefined>(traveler?.photo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!isSyncConfigured()) { setErr('Set a trip code in Sync & Setup first to upload pictures.'); return; }
    setBusy(true); setErr('');
    try { setPhoto(await uploadImageFile(f, 600, 0.85)); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Upload failed'); }
    setBusy(false);
  }

  async function save() {
    if (!name.trim()) return;
    const isNew = !traveler;
    await put<Traveler>({
      kind: 'traveler', id: traveler?.id ?? crypto.randomUUID(),
      name: name.trim(), role, emoji, photo: photo || undefined,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} traveller: ${name.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={traveler ? 'Edit person' : 'Add person'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!name.trim() || busy} submitLabel={traveler ? 'Save' : 'Add'} />}>
      {/* Profile picture */}
      <div className="flex flex-col items-center mb-4">
        <span className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-5xl relative">
          {busy ? <Loader className="animate-spin text-slate-400" size={28} />
            : photo ? <img src={photo} alt="" className="w-full h-full object-cover" />
            : <span>{emoji}</span>}
          {photo && !busy && (
            <button onClick={() => setPhoto(undefined)} aria-label="Remove picture"
              className="absolute top-0 right-0 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center">
              <X size={15} />
            </button>
          )}
        </span>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="mt-3 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm flex items-center gap-1.5 active:bg-slate-200 disabled:opacity-40">
          <Upload size={14} /> {photo ? 'Change picture' : 'Upload picture'}
        </button>
        <p className="text-[11px] text-slate-400 mt-1">Choose from your photo album</p>
      </div>

      <Field label="Name"><TextInput autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sylvester" /></Field>
      <Field label="Role">
        <Select value={role} onChange={e => setRole(e.target.value as 'adult' | 'child')}>
          <option value="adult">Adult</option>
          <option value="child">Child</option>
        </Select>
      </Field>
      <Field label="Fallback emoji (used when no picture)">
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map(em => (
            <button key={em} onClick={() => setEmoji(em)}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition ${emoji === em ? 'border-accent bg-accent/5' : 'border-line'}`}>
              {em}
            </button>
          ))}
        </div>
      </Field>
      {err && <p className="text-sunset text-sm mt-1">{err}</p>}
    </Sheet>
  );
}
