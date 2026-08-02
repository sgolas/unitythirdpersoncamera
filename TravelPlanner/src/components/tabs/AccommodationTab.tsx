import { useRef, useState } from 'react';
import { Trash2, MapPin, Phone, FileUp, Loader2 } from 'lucide-react';
import { useAccommodation, useTrip } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { Accommodation } from '../../types';
import { money } from '../../types';
import { fmtDate, todayStr, tripLength } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { extractPdfText, parseStay, type ParsedStay } from '../../lib/stayImport';

export function AccommodationTab() {
  const stays = useAccommodation();
  const trip = useTrip();
  const cur = trip?.tripCurrency ?? 'EUR';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Accommodation | null>(null);
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
      setImportInfo({ found: p.found, provider: p.provider });
      setImportDraft({
        name: p.name, city: p.city, address: p.address,
        checkIn: p.checkIn, checkOut: p.checkOut,
        confirmation: p.confirmation, cost: p.cost, costCurrency: p.costCurrency || cur,
        notes: p.notes,
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
          {stays.map(s => {
            const nights = tripLength(s.checkIn, s.checkOut);
            return (
              <div key={s.id} onClick={() => setEditing(s)}
                className="bg-white rounded-2xl p-4 shadow-sm group active:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{s.name}</p>
                    {s.city && <p className="text-sm text-grape font-medium">{s.city}</p>}
                  </div>
                  <button onClick={ev => { ev.stopPropagation(); setPendingDelete(s); }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 flex-shrink-0">
                    <Trash2 size={14} className="text-slate-300 hover:text-sunset" />
                  </button>
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
                  {s.cost > 0 && <span className="ml-auto font-semibold text-slate-700">{money(s.cost, s.costCurrency ?? cur)}</span>}
                </div>
              </div>
            );
          })}
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
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.name}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('accommodation', pendingDelete.id, `Removed stay: ${pendingDelete.name}`); setPendingDelete(null); }} />
      )}
    </div>
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
    </Sheet>
  );
}
