import { useRef, useState } from 'react';
import { Trash2, Phone, Car, Plus, X, Loader, ImageIcon } from 'lucide-react';
import { useCarRentals, useTrip } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { CarRental } from '../../types';
import { money } from '../../types';
import { fmtDate, fmtTime, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, FormFooter, Fab, EmptyState, ConfirmDelete, CostField, Overlay } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { compressToDataUrl } from '../../lib/photoUpload';

export function CarRentalTab() {
  const rentals = useCarRentals();
  const trip = useTrip();
  const cur = trip?.tripCurrency ?? 'EUR';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CarRental | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CarRental | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Car Rentals" subtitle={`${rentals.length} reservation${rentals.length === 1 ? '' : 's'}`}
        gradient="linear-gradient(135deg,#0f766e,#22c55e)" icon="🚗" />

      {rentals.length === 0 ? (
        <EmptyState emoji="🚗" title="No car rentals yet"
          hint="Add a reservation — pickup & drop-off, booking number, cost and receipts" />
      ) : (
        <div className="px-4 py-4 space-y-3">
          {rentals.map(r => (
            <div key={r.id} onClick={() => setEditing(r)}
              className="bg-white rounded-2xl p-4 shadow-sm group active:bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate flex items-center gap-1.5"><Car size={15} className="text-emerald-600" /> {r.company || 'Car rental'}</p>
                  {r.carType && <p className="text-sm text-emerald-700 font-medium">{r.carType}</p>}
                </div>
                <button onClick={ev => { ev.stopPropagation(); setPendingDelete(r); }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 flex-shrink-0">
                  <Trash2 size={14} className="text-slate-300 hover:text-sunset" />
                </button>
              </div>

              <div className="flex items-stretch gap-2 mt-3 bg-slate-50 rounded-xl p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Pick-up</p>
                  <p className="text-sm font-semibold text-slate-700 truncate">{r.pickupLocation || '—'}</p>
                  <p className="text-xs text-slate-500">{fmtDate(r.pickupDate)}{r.pickupTime ? ` · ${fmtTime(r.pickupTime)}` : ''}</p>
                </div>
                <div className="text-emerald-600 self-center">→</div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Drop-off</p>
                  <p className="text-sm font-semibold text-slate-700 truncate">{r.dropoffLocation || '—'}</p>
                  <p className="text-xs text-slate-500">{r.dropoffDate ? fmtDate(r.dropoffDate) : ''}{r.dropoffTime ? ` · ${fmtTime(r.dropoffTime)}` : ''}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                {r.confirmation && <span>🎫 {r.confirmation}</span>}
                {r.driver && <span>👤 {r.driver}</span>}
                {r.contact && <span className="flex items-center gap-1"><Phone size={11} /> {r.contact}</span>}
                {r.receipts?.length > 0 && <span className="flex items-center gap-1"><ImageIcon size={11} /> {r.receipts.length}</span>}
                {r.cost > 0 && <span className="ml-auto font-semibold text-slate-700">{money(r.cost, r.costCurrency ?? cur)}</span>}
              </div>

              {r.receipts?.length > 0 && (
                <div className="flex gap-2 mt-2.5 overflow-x-auto no-scrollbar">
                  {r.receipts.map((src, i) => (
                    <img key={i} src={src} alt="" onClick={e => { e.stopPropagation(); setViewer(src); }}
                      className="w-14 h-14 rounded-lg object-cover border border-line flex-shrink-0" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add car rental" />

      {(adding || editing) && (
        <RentalSheet rental={editing} currency={cur} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`${pendingDelete.company || 'this rental'}`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('carrental', pendingDelete.id, `Removed car rental: ${pendingDelete.company || 'reservation'}`); setPendingDelete(null); }} />
      )}
      {viewer && (
        <Overlay>
          <div className="fixed inset-0 z-[800] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewer(null)}>
            <img src={viewer} alt="Receipt" className="max-w-full max-h-full rounded-lg" />
            <button aria-label="Close" className="absolute top-5 right-5 text-white/80"><X size={26} /></button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function RentalSheet({ rental, currency, onClose }: { rental: CarRental | null; currency: string; onClose: () => void }) {
  const [company, setCompany] = useState(rental?.company ?? '');
  const [carType, setCarType] = useState(rental?.carType ?? '');
  const [pickupLocation, setPickupLocation] = useState(rental?.pickupLocation ?? '');
  const [pickupDate, setPickupDate] = useState(rental?.pickupDate ?? todayStr());
  const [pickupTime, setPickupTime] = useState(rental?.pickupTime ?? '');
  const [dropoffLocation, setDropoffLocation] = useState(rental?.dropoffLocation ?? '');
  const [dropoffDate, setDropoffDate] = useState(rental?.dropoffDate ?? '');
  const [dropoffTime, setDropoffTime] = useState(rental?.dropoffTime ?? '');
  const [confirmation, setConfirmation] = useState(rental?.confirmation ?? '');
  const [driver, setDriver] = useState(rental?.driver ?? '');
  const [contact, setContact] = useState(rental?.contact ?? '');
  const [cost, setCost] = useState(rental ? String(rental.cost || '') : '');
  const [costCurrency, setCostCurrency] = useState(rental?.costCurrency ?? currency);
  const [notes, setNotes] = useState(rental?.notes ?? '');
  const [receipts, setReceipts] = useState<string[]>(rental?.receipts ?? []);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const added = await Promise.all(files.map(f => compressToDataUrl(f, 1400, 0.7).catch(() => '')));
      setReceipts(rs => [...rs, ...added.filter(Boolean)]);
    } finally { setBusy(false); }
  }

  async function save() {
    if (!company.trim() && !pickupLocation.trim()) return;
    const isNew = !rental;
    await put<CarRental>({
      kind: 'carrental', id: rental?.id ?? crypto.randomUUID(),
      company: company.trim(), carType: carType.trim(),
      pickupLocation: pickupLocation.trim(), pickupDate, pickupTime,
      dropoffLocation: dropoffLocation.trim(), dropoffDate, dropoffTime,
      confirmation: confirmation.trim(), driver: driver.trim(), contact: contact.trim(),
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(), receipts,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} car rental: ${company.trim() || pickupLocation.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  const disabled = !company.trim() && !pickupLocation.trim();

  return (
    <Sheet title={rental ? 'Edit car rental' : 'Add car rental'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={disabled} submitLabel={rental ? 'Save' : 'Add'} />}>
      <Field label="Rental company"><TextInput autoFocus value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Hertz, Avis, Sixt" /></Field>
      <Field label="Vehicle / class"><TextInput value={carType} onChange={e => setCarType(e.target.value)} placeholder="e.g. SUV — VW Tiguan" /></Field>

      <Field label="Pick-up location"><PlaceInput value={pickupLocation} onChange={setPickupLocation} placeholder="Search a location…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pick-up date"><TextInput type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} /></Field>
        <Field label="Pick-up time"><TextInput type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} /></Field>
      </div>

      <Field label="Drop-off location"><PlaceInput value={dropoffLocation} onChange={setDropoffLocation} placeholder="Search a location…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Drop-off date"><TextInput type="date" value={dropoffDate} onChange={e => setDropoffDate(e.target.value)} /></Field>
        <Field label="Drop-off time"><TextInput type="time" value={dropoffTime} onChange={e => setDropoffTime(e.target.value)} /></Field>
      </div>

      <Field label="Reservation number"><TextInput value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Booking / confirmation #" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Main driver"><TextInput value={driver} onChange={e => setDriver(e.target.value)} placeholder="Name" /></Field>
        <Field label="Branch contact"><TextInput value={contact} onChange={e => setContact(e.target.value)} placeholder="Phone / email" /></Field>
      </div>
      <CostField value={cost} onChange={setCost} currency={costCurrency} onCurrencyChange={setCostCurrency} />

      {/* Receipts / documents */}
      <Field label="Receipts & documents">
        <div className="flex flex-wrap gap-2">
          {receipts.map((src, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-line">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setReceipts(rs => rs.filter((_, j) => j !== i))} aria-label="Remove receipt"
                className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center">
                <X size={13} />
              </button>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center text-muted active:bg-slate-50 disabled:opacity-50">
            {busy ? <Loader size={18} className="animate-spin" /> : <><Plus size={18} /><span className="text-[10px] mt-0.5">Add</span></>}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
        <p className="text-[11px] text-slate-400 mt-1.5">Snap or pick receipt/agreement photos — stored on your device and synced to the group.</p>
      </Field>

      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Insurance, fuel policy, extras…" /></Field>
    </Sheet>
  );
}
