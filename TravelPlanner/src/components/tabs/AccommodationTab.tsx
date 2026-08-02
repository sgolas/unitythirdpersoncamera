import { useEffect, useRef, useState } from 'react';
import { Trash2, MapPin, Phone, FileUp, Loader2, Pencil, FileText, Ticket, Wallet } from 'lucide-react';
import { useAccommodation, useTrip } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { Accommodation } from '../../types';
import { money } from '../../types';
import { fmtDate, todayStr, tripLength } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { extractPdfText, parseStay, type ParsedStay } from '../../lib/stayImport';
import { readFileAsDataUrl, approxBytes, MAX_ATTACH_BYTES } from '../../lib/attachments';
import { DocViewer } from '../DocViewer';

export function AccommodationTab() {
  const stays = useAccommodation();
  const trip = useTrip();
  const cur = trip?.tripCurrency ?? 'EUR';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Accommodation | null>(null);
  const [viewing, setViewing] = useState<Accommodation | null>(null);
  const [pdfView, setPdfView] = useState<{ name: string; mime?: string; dataUrl: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Accommodation | null>(null);
  const [importDraft, setImportDraft] = useState<Partial<Accommodation> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<{ found: string[]; provider: string } | null>(null);
  const [importErr, setImportErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setImportErr('');
    setImporting(true);
    try {
      const text = await extractPdfText(file);
      const p: ParsedStay = parseStay(text);
      if (!p.name && !p.city && !p.checkIn && !p.confirmation) {
        setImportErr("Couldn't read a booking from that PDF. You can still add it by hand.");
        return;
      }
      // Keep a copy of the original PDF with the stay (if it's within the cap).
      let fileData: string | undefined, fileName: string | undefined, fileMime: string | undefined;
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl && approxBytes(dataUrl) <= MAX_ATTACH_BYTES) {
        fileData = dataUrl; fileName = file.name || 'confirmation.pdf'; fileMime = 'application/pdf';
      }
      const found = fileData ? [...p.found, 'PDF'] : p.found;
      setImportInfo({ found, provider: p.provider });
      setImportDraft({
        name: p.name, city: p.city, address: p.address,
        checkIn: p.checkIn, checkOut: p.checkOut,
        confirmation: p.confirmation, cost: p.cost, costCurrency: p.costCurrency || cur,
        notes: p.notes, fileData, fileName, fileMime,
      });
    } catch (err) {
      setImportErr('That file could not be read as a PDF.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Stays" subtitle={`${stays.length} booked`}
        gradient="linear-gradient(135deg,#7c3aed,#a78bfa)" icon="🏨" />

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={onPickPdf} />
      <div className="px-4 pt-4">
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-grape/40 bg-grape/5 text-grape font-semibold active:scale-[0.99] transition disabled:opacity-60">
          {importing ? <><Loader2 size={18} className="animate-spin" /> Reading PDF…</>
            : <><FileUp size={18} /> Import from booking PDF</>}
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-1.5">
          Airbnb, Booking.com &amp; more — reads it on your device, then you confirm.
        </p>
        {importErr && <p className="text-xs text-sunset text-center mt-2">{importErr}</p>}
      </div>

      {stays.length === 0 ? (
        <EmptyState emoji="🏨" title="No stays yet" hint="Add hotels, apartments & guesthouses" />
      ) : (
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-slate-400 text-center -mt-1 mb-1">Tap to view · press &amp; hold to edit or delete</p>
          {stays.map(s => (
            <StayCard key={s.id} stay={s} currency={cur}
              onView={() => setViewing(s)} onEdit={() => setEditing(s)} onDelete={() => setPendingDelete(s)} />
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add stay" />

      {(adding || editing) && (
        <StaySheet stay={editing} currency={cur} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {importDraft && (
        <StaySheet stay={null} initial={importDraft} currency={cur} banner={importInfo}
          onClose={() => { setImportDraft(null); setImportInfo(null); }} />
      )}
      {viewing && (
        <StayDetail stay={viewing} currency={cur}
          onClose={() => setViewing(null)}
          onViewPdf={() => viewing.fileData && setPdfView({ name: viewing.fileName || 'confirmation.pdf', mime: viewing.fileMime, dataUrl: viewing.fileData })} />
      )}
      {pdfView && (
        <DocViewer name={pdfView.name} mime={pdfView.mime} dataUrl={pdfView.dataUrl} onClose={() => setPdfView(null)} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.name}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('accommodation', pendingDelete.id, `Removed stay: ${pendingDelete.name}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

/* A stay card: tap to view; press-and-hold to reveal edit / delete actions
 * (the same "hold like you're moving it" gesture used elsewhere in the app). */
function StayCard({ stay: s, currency, onView, onEdit, onDelete }: {
  stay: Accommodation; currency: string;
  onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const nights = tripLength(s.checkIn, s.checkOut);

  function clearTimer() { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }
  function onDown(e: React.PointerEvent) {
    if (armed) return;
    start.current = { x: e.clientX, y: e.clientY };
    held.current = false;
    clearTimer();
    timer.current = window.setTimeout(() => { held.current = true; setArmed(true); }, 450);
  }
  function onMove(e: React.PointerEvent) {
    // Cancel the long-press if the finger moves (i.e. the list is scrolling).
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clearTimer();
  }
  function onUp() { clearTimer(); start.current = null; }
  useEffect(() => clearTimer, []);

  return (
    <div
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      onClick={() => { if (held.current) { held.current = false; return; } if (armed) setArmed(false); else onView(); }}
      className={`relative bg-white rounded-2xl p-4 shadow-sm active:bg-slate-50 transition ${armed ? 'ring-2 ring-grape/50 animate-wiggle' : ''}`}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 truncate">{s.name}</p>
          {s.city && <p className="text-sm text-grape font-medium">{s.city}</p>}
        </div>
        {armed ? (
          <div className="flex items-center gap-1.5 flex-shrink-0" data-no-drag>
            <button onClick={ev => { ev.stopPropagation(); setArmed(false); onEdit(); }} aria-label="Edit stay"
              className="w-9 h-9 rounded-full bg-grape text-white flex items-center justify-center shadow active:scale-90">
              <Pencil size={16} />
            </button>
            <button onClick={ev => { ev.stopPropagation(); setArmed(false); onDelete(); }} aria-label="Delete stay"
              className="w-9 h-9 rounded-full bg-red-50 text-sunset flex items-center justify-center active:scale-90">
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          s.fileData && <FileText size={15} className="text-grape/70 flex-shrink-0 mt-0.5" aria-label="Has PDF" />
        )}
      </div>
      <div className="flex items-center gap-2 mt-3 bg-slate-50 rounded-xl p-2.5">
        <div className="flex-1 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Check in</p>
          <p className="text-sm font-semibold text-slate-700">{fmtDate(s.checkIn)}</p>
        </div>
        <div className="text-xs text-grape font-bold px-2">{nights}n</div>
        <div className="flex-1 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Check out</p>
          <p className="text-sm font-semibold text-slate-700">{fmtDate(s.checkOut)}</p>
        </div>
      </div>
      {s.address && <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2"><MapPin size={12} /> {s.address}</p>}
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {s.contact && <span className="flex items-center gap-1"><Phone size={11} /> {s.contact}</span>}
        {s.confirmation && <span>🎫 {s.confirmation}</span>}
        {s.cost > 0 && <span className="ml-auto font-semibold text-slate-700">{money(s.cost, s.costCurrency ?? currency)}</span>}
      </div>
    </div>
  );
}

/* Read-only detail view opened by tapping a stay. */
function StayDetail({ stay: s, currency, onClose, onViewPdf }: {
  stay: Accommodation; currency: string; onClose: () => void; onViewPdf: () => void;
}) {
  const nights = tripLength(s.checkIn, s.checkOut);
  const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
        <p className="text-sm text-slate-700 font-medium break-words">{value}</p>
      </div>
    </div>
  );
  return (
    <Sheet title={s.name || 'Stay'} onClose={onClose}>
      {s.city && <p className="text-grape font-semibold -mt-1 mb-2">{s.city}</p>}
      <div className="bg-white rounded-2xl">
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 mb-1">
          <div className="flex-1 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Check in</p>
            <p className="text-sm font-semibold text-slate-700">{fmtDate(s.checkIn)}</p>
          </div>
          <div className="text-xs text-grape font-bold px-2">{nights}n</div>
          <div className="flex-1 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Check out</p>
            <p className="text-sm font-semibold text-slate-700">{fmtDate(s.checkOut)}</p>
          </div>
        </div>
        {s.address && <Row icon={<MapPin size={16} />} label="Address" value={s.address} />}
        {s.confirmation && <Row icon={<Ticket size={16} />} label="Confirmation" value={s.confirmation} />}
        {s.cost > 0 && <Row icon={<Wallet size={16} />} label="Cost" value={money(s.cost, s.costCurrency ?? currency)} />}
        {s.contact && <Row icon={<Phone size={16} />} label="Contact" value={s.contact} />}
        {s.notes && <Row icon={<FileText size={16} />} label="Notes" value={s.notes} />}
      </div>
      {s.fileData && (
        <button onClick={onViewPdf}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-2xl bg-grape/10 text-grape font-semibold active:scale-[0.99] transition">
          <FileText size={18} /> View confirmation PDF
        </button>
      )}
      <p className="text-[11px] text-slate-400 text-center mt-3">Press &amp; hold the stay in the list to edit or delete it.</p>
    </Sheet>
  );
}

function StaySheet({ stay, initial, currency, banner, onClose }: { stay: Accommodation | null; initial?: Partial<Accommodation>; currency: string; banner?: { found: string[]; provider: string } | null; onClose: () => void }) {
  // For a new stay we may seed fields from a PDF import (`initial`).
  const seed = stay ?? initial;
  const [name, setName] = useState(seed?.name ?? '');
  const [city, setCity] = useState(seed?.city ?? '');
  const [address, setAddress] = useState(seed?.address ?? '');
  const [checkIn, setCheckIn] = useState(seed?.checkIn || todayStr());
  const [checkOut, setCheckOut] = useState(seed?.checkOut || seed?.checkIn || todayStr());
  const [confirmation, setConfirmation] = useState(seed?.confirmation ?? '');
  const [contact, setContact] = useState(seed?.contact ?? '');
  const [cost, setCost] = useState(seed?.cost ? String(seed.cost) : '');
  const [costCurrency, setCostCurrency] = useState(seed?.costCurrency || currency);
  const [notes, setNotes] = useState(seed?.notes ?? '');

  async function save() {
    if (!name.trim()) return;
    const isNew = !stay;
    await put<Accommodation>({
      kind: 'accommodation', id: stay?.id ?? crypto.randomUUID(),
      name: name.trim(), city: city.trim(), address: address.trim(),
      checkIn, checkOut, confirmation: confirmation.trim(), contact: contact.trim(),
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(),
      // Preserve the attached confirmation PDF (from import or a prior edit).
      fileData: seed?.fileData, fileName: seed?.fileName, fileMime: seed?.fileMime,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} stay: ${name.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={stay ? 'Edit stay' : banner ? 'Review imported stay' : 'Add stay'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!name.trim()} submitLabel={banner ? 'Save stay' : stay ? 'Save' : 'Add stay'} />}>
      {banner && (
        <div className="rounded-xl bg-grape/5 border border-grape/20 p-3 mb-1">
          <p className="text-sm font-semibold text-grape">
            {banner.provider === 'airbnb' ? 'Airbnb booking read' : banner.provider === 'generic' ? 'Booking read' : `${banner.provider} booking read`} · {banner.found.length} field{banner.found.length === 1 ? '' : 's'} filled
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Double-check everything below, then save. Anything the PDF didn’t include is left blank for you to fill.</p>
        </div>
      )}
      <Field label="Name"><TextInput autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hotel Lumière" /></Field>
      <Field label="City"><PlaceInput value={city} onChange={setCity} placeholder="Search a city…" /></Field>
      <Field label="Address"><PlaceInput value={address} onChange={setAddress} placeholder="Search an address…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check in"><TextInput type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></Field>
        <Field label="Check out"><TextInput type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></Field>
      </div>
      <Field label="Confirmation"><TextInput value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Optional" /></Field>
      <CostField value={cost} onChange={setCost} currency={costCurrency} onCurrencyChange={setCostCurrency} />
      <Field label="Contact"><TextInput value={contact} onChange={e => setContact(e.target.value)} placeholder="Phone / email" /></Field>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
      {seed?.fileData && (
        <div className="flex items-center gap-2 text-sm text-grape bg-grape/5 rounded-xl px-3 py-2.5">
          <FileText size={16} /> <span className="truncate">{seed.fileName || 'Confirmation PDF'} kept with this stay</span>
        </div>
      )}
    </Sheet>
  );
}
