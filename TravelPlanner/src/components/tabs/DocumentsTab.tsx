import { useState, useRef } from 'react';
import { Trash2, Camera, AlertTriangle } from 'lucide-react';
import { useDocuments, useTravelers, travelerName } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { TravelDocument, DocType } from '../../types';
import { fmtDate, daysUntil } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';

const TYPES: { key: DocType; label: string; emoji: string }[] = [
  { key: 'passport',    label: 'Passport',    emoji: '🛂' },
  { key: 'visa',        label: 'Visa',        emoji: '📗' },
  { key: 'id',          label: 'ID Card',     emoji: '🪪' },
  { key: 'insurance',   label: 'Insurance',   emoji: '🛡️' },
  { key: 'ticket',      label: 'Ticket',      emoji: '🎟️' },
  { key: 'reservation', label: 'Reservation', emoji: '📋' },
  { key: 'vaccination', label: 'Vaccination', emoji: '💉' },
  { key: 'other',       label: 'Other',       emoji: '📄' },
];
const typeMeta = (k: DocType) => TYPES.find(t => t.key === k)!;

// Downscale a photo to keep IndexedDB small.
function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

export function DocumentsTab() {
  const docs = useDocuments();
  const travelers = useTravelers();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TravelDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TravelDocument | null>(null);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Travel Documents" subtitle={`${docs.length} stored`}
        gradient="linear-gradient(135deg,#475569,#64748b)" icon="🛂" />

      {docs.length === 0 ? (
        <EmptyState emoji="🛂" title="No documents yet" hint="Store passports, visas, tickets & insurance" />
      ) : (
        <div className="px-4 py-4 space-y-2">
          {docs.map(d => {
            const m = typeMeta(d.docType);
            const dLeft = daysUntil(d.expiryDate);
            const expiringSoon = d.expiryDate && dLeft >= 0 && dLeft <= 180;
            const expired = d.expiryDate && dLeft < 0;
            return (
              <div key={d.id} onClick={() => setEditing(d)}
                className="bg-white rounded-2xl p-3 shadow-sm flex gap-3 group active:bg-slate-50">
                {d.photoData
                  ? <img src={d.photoData} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  : <span className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center text-2xl flex-shrink-0">{m.emoji}</span>}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{d.title}</p>
                  <p className="text-xs text-slate-400">
                    {m.label}{d.travelerId ? ` · ${travelerName(travelers, d.travelerId)}` : ''}
                  </p>
                  {d.expiryDate && (
                    <p className={`text-xs mt-0.5 font-medium flex items-center gap-1 ${
                      expired ? 'text-sunset' : expiringSoon ? 'text-amber' : 'text-slate-400'}`}>
                      {(expired || expiringSoon) && <AlertTriangle size={11} />}
                      {expired ? 'Expired ' : 'Expires '}{fmtDate(d.expiryDate, { month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <button onClick={ev => { ev.stopPropagation(); setPendingDelete(d); }}
                  className="p-1.5 rounded-lg self-start opacity-0 group-hover:opacity-100 hover:bg-red-50">
                  <Trash2 size={15} className="text-slate-300 hover:text-sunset" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add document" />

      {(adding || editing) && (
        <DocSheet doc={editing} travelers={travelers} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.title}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('document', pendingDelete.id, `Removed document: ${pendingDelete.title}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function DocSheet({ doc, travelers, onClose }: { doc: TravelDocument | null; travelers: any[]; onClose: () => void }) {
  const [title, setTitle] = useState(doc?.title ?? '');
  const [docType, setDocType] = useState<DocType>(doc?.docType ?? 'passport');
  const [travelerId, setTravelerId] = useState(doc?.travelerId ?? '');
  const [number, setNumber] = useState(doc?.number ?? '');
  const [issuer, setIssuer] = useState(doc?.issuer ?? '');
  const [expiryDate, setExpiryDate] = useState(doc?.expiryDate ?? '');
  const [notes, setNotes] = useState(doc?.notes ?? '');
  const [photoData, setPhotoData] = useState(doc?.photoData ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPhotoData(await fileToCompressedDataUrl(f));
  }

  async function save() {
    if (!title.trim()) return;
    const isNew = !doc;
    await put<TravelDocument>({
      kind: 'document', id: doc?.id ?? crypto.randomUUID(),
      title: title.trim(), docType, travelerId: travelerId || null,
      number: number.trim(), issuer: issuer.trim(), issueDate: doc?.issueDate ?? '',
      expiryDate, notes: notes.trim(), photoData,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} document: ${title.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={doc ? 'Edit document' : 'Add document'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!title.trim()} submitLabel={doc ? 'Save' : 'Add document'} />}>
      <button onClick={() => fileRef.current?.click()}
        className="w-full mb-4 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden active:bg-slate-50">
        {photoData
          ? <img src={photoData} alt="" className="w-full max-h-52 object-contain bg-slate-50" />
          : <div className="py-8 flex flex-col items-center text-slate-400"><Camera size={26} /><span className="text-sm mt-1 font-medium">Add a photo / scan</span></div>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />

      <Field label="Title"><TextInput autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. John’s Passport" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={docType} onChange={e => setDocType(e.target.value as DocType)}>
            {TYPES.map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
          </Select>
        </Field>
        <Field label="Belongs to">
          <Select value={travelerId} onChange={e => setTravelerId(e.target.value)}>
            <option value="">Whole family</option>
            {travelers.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Number / reference"><TextInput value={number} onChange={e => setNumber(e.target.value)} placeholder="Optional" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issuer"><TextInput value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="Optional" /></Field>
        <Field label="Expires"><TextInput type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Sheet>
  );
}
