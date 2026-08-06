import { useState, useRef } from 'react';
import { Trash2, Camera, AlertTriangle, ImagePlus, X, FileText, Eye, Download } from 'lucide-react';
import { useDocuments, useTravelers, travelerName, authorColor } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { TravelDocument, DocType } from '../../types';
import { fmtDate, daysUntil } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';
import {
  readFileAsDataUrl, compressImageToDataUrl, approxBytes, MAX_ATTACH_BYTES, isPdf, saveToPhone,
} from '../../lib/attachments';
import { DocViewer } from '../DocViewer';

const TYPES: { key: DocType; label: string; emoji: string }[] = [
  { key: 'passport',    label: 'Passport',    emoji: '🛂' },
  { key: 'visa',        label: 'Visa',        emoji: '📗' },
  { key: 'id',          label: 'ID Card',     emoji: '🪪' },
  { key: 'insurance',   label: 'Insurance',   emoji: '🛡️' },
  { key: 'ticket',      label: 'Ticket',      emoji: '🎟️' },
  { key: 'reservation', label: 'Reservation', emoji: '📋' },
  { key: 'vaccination', label: 'Vaccination', emoji: '💉' },
  { key: 'flightreceipt',   label: 'Flight receipt',   emoji: '🧾' },
  { key: 'purchasereceipt', label: 'Purchase receipt', emoji: '🧾' },
  { key: 'warranty',        label: 'Warranty',         emoji: '📑' },
  { key: 'other',       label: 'Other',       emoji: '📄' },
];
const typeMeta = (k: DocType) => TYPES.find(t => t.key === k)!;

/** The viewable/downloadable attachment on a document (PDF or image), if any. */
export function attachmentOf(d: TravelDocument): { dataUrl: string; name: string; mime: string } | null {
  const dataUrl = d.fileData || d.photoData;
  if (!dataUrl) return null;
  const mime = d.fileMime || 'image/jpeg';
  const name = d.fileName || `${d.title || 'document'}.${isPdf(mime, d.fileName) ? 'pdf' : 'jpg'}`;
  return { dataUrl, name, mime };
}

export function DocumentsTab() {
  const docs = useDocuments();
  const travelers = useTravelers();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TravelDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TravelDocument | null>(null);
  const [viewing, setViewing] = useState<TravelDocument | null>(null);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Travel Documents" subtitle={`${docs.length} stored`}
        gradient="linear-gradient(135deg,#475569,#64748b)" icon="🛂" />

      {docs.length === 0 ? (
        <EmptyState emoji="🛂" title="No documents yet" hint="Store passports, visas, tickets, PDFs & insurance" />
      ) : (
        <div className="px-4 py-4 space-y-2">
          {docs.map(d => {
            const m = typeMeta(d.docType);
            const dLeft = daysUntil(d.expiryDate);
            const expiringSoon = d.expiryDate && dLeft >= 0 && dLeft <= 180;
            const expired = d.expiryDate && dLeft < 0;
            const att = attachmentOf(d);
            const pdf = att && isPdf(att.mime, att.name);
            return (
              <div key={d.id} onClick={() => setEditing(d)}
                className="bg-white rounded-2xl p-3 shadow-sm flex gap-3 group active:bg-slate-50">
                {/* Thumbnail — tap to view the attachment (if any). */}
                <button
                  onClick={ev => { ev.stopPropagation(); if (att) setViewing(d); else setEditing(d); }}
                  className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center bg-slate-100">
                  {att && !pdf
                    ? <img src={att.dataUrl} alt="" className="w-full h-full object-cover" />
                    : pdf
                      ? <span className="w-full h-full bg-rose-50 flex flex-col items-center justify-center text-rose-500"><FileText size={20} /><span className="text-[8px] font-bold mt-0.5">PDF</span></span>
                      : <span className="text-2xl">{m.emoji}</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate" style={{ color: authorColor(travelers, d) }}>{d.title}</p>
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
                  {att && (
                    <p className="text-[11px] text-accent font-semibold mt-0.5 flex items-center gap-1"><Eye size={11} /> Tap to view</p>
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
      {viewing && (() => {
        const a = attachmentOf(viewing)!;
        return <DocViewer name={a.name} mime={a.mime} dataUrl={a.dataUrl} onClose={() => setViewing(null)} />;
      })()}
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
  const [fileData, setFileData] = useState(doc?.fileData ?? '');
  const [fileName, setFileName] = useState(doc?.fileName ?? '');
  const [fileMime, setFileMime] = useState(doc?.fileMime ?? '');
  const [busy, setBusy] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null); // opens the camera (images)
  const fileRef = useRef<HTMLInputElement>(null);   // gallery / files (images or PDF)

  const pdf = isPdf(fileMime, fileName);
  const viewUrl = fileData || photoData;
  const hasAttachment = !!viewUrl;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!f) return;
    setBusy(true);
    try {
      if (isPdf(f.type, f.name)) {
        const dataUrl = await readFileAsDataUrl(f);
        if (approxBytes(dataUrl) > MAX_ATTACH_BYTES) { alert('That PDF is too large (max 12 MB). Try a smaller scan.'); return; }
        setFileData(dataUrl); setPhotoData('');
        setFileName(f.name); setFileMime(f.type || 'application/pdf');
      } else {
        // Documents need to stay legible, so keep more resolution/quality than
        // a gallery thumbnail.
        const thumb = await compressImageToDataUrl(f, 2200, 0.85);
        if (thumb) { setPhotoData(thumb); setFileData(''); setFileName(f.name || `${(title || 'document').trim()}.jpg`); setFileMime('image/jpeg'); }
        else alert('Couldn’t read that image. Try a JPG or PNG photo, or attach the document as a PDF.');
      }
    } finally { setBusy(false); }
  }

  function clearAttachment() { setPhotoData(''); setFileData(''); setFileName(''); setFileMime(''); }

  async function doSave() {
    if (!viewUrl) return;
    const name = fileName || `${(title || 'document').trim()}.${pdf ? 'pdf' : 'jpg'}`;
    const r = await saveToPhone(viewUrl, name);
    alert(r.message);
  }

  async function save() {
    if (!title.trim()) return;
    const isNew = !doc;
    await put<TravelDocument>({
      kind: 'document', id: doc?.id ?? crypto.randomUUID(),
      title: title.trim(), docType, travelerId: travelerId || null,
      number: number.trim(), issuer: issuer.trim(), issueDate: doc?.issueDate ?? '',
      expiryDate, notes: notes.trim(), photoData,
      fileData: fileData || undefined, fileName: fileName || undefined, fileMime: fileMime || undefined,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} document: ${title.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={doc ? 'Edit document' : 'Add document'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!title.trim()} submitLabel={doc ? 'Save' : 'Add document'} />}>
      {/* Attachment — take a photo with the camera, or pick an image / PDF. */}
      <div className="mb-4">
        {photoData ? (
          <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200">
            <img src={photoData} alt="" className="w-full max-h-52 object-contain bg-slate-50" />
            <button onClick={clearAttachment} aria-label="Remove"
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center">
              <X size={16} />
            </button>
            <div className="flex divide-x divide-slate-200 border-t border-slate-200">
              <button onClick={() => cameraRef.current?.click()} disabled={busy}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">
                <Camera size={15} /> Retake
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">
                <ImagePlus size={15} /> Replace
              </button>
            </div>
          </div>
        ) : pdf ? (
          <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-50">
            <div className="py-7 flex flex-col items-center text-rose-500">
              <FileText size={30} /><span className="text-sm mt-1.5 font-semibold text-slate-600 truncate max-w-[80%]">{fileName || 'PDF attached'}</span>
            </div>
            <button onClick={clearAttachment} aria-label="Remove"
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center">
              <X size={16} />
            </button>
            <div className="flex border-t border-slate-200">
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">
                <ImagePlus size={15} /> Replace
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => cameraRef.current?.click()} disabled={busy}
              className="rounded-2xl border-2 border-dashed border-slate-200 py-7 flex flex-col items-center text-slate-500 active:bg-slate-50 disabled:opacity-50">
              <Camera size={26} /><span className="text-sm mt-1.5 font-semibold">Take photo</span>
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="rounded-2xl border-2 border-dashed border-slate-200 py-7 flex flex-col items-center text-slate-500 active:bg-slate-50 disabled:opacity-50">
              <ImagePlus size={26} /><span className="text-sm mt-1.5 font-semibold">Photo or PDF</span>
            </button>
          </div>
        )}
        {busy && <p className="text-xs text-slate-400 text-center mt-2">Processing…</p>}
      </div>

      {hasAttachment && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setShowViewer(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 active:bg-slate-200 text-sm font-semibold text-slate-700">
            <Eye size={15} /> View
          </button>
          <button onClick={doSave}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 active:bg-slate-200 text-sm font-semibold text-slate-700">
            <Download size={15} /> Save to phone
          </button>
        </div>
      )}

      {/* capture="environment" opens the rear camera straight away (images). */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />

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

      {showViewer && viewUrl && (
        <DocViewer name={fileName || `${(title || 'document').trim()}.${pdf ? 'pdf' : 'jpg'}`}
          mime={fileMime || 'image/jpeg'} dataUrl={viewUrl} onClose={() => setShowViewer(false)} />
      )}
    </Sheet>
  );
}
