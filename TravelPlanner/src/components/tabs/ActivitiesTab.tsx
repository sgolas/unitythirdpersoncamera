import { useEffect, useRef, useState } from 'react';
import { Trash2, MapPin, Clock, FileUp, Loader2, Pencil, FileText, Ticket, Wallet, Tag } from 'lucide-react';
import { useActivities, useTrip, useBudgetSheets, useTravelers, authorColor } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { Activity, BudgetSheet, TripMeta } from '../../types';
import { money } from '../../types';
import { fmtDate, fmtTime, todayStr } from '../../utils/format';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete, CostField } from '../ui';
import { PlaceInput } from '../PlaceInput';
import { extractPdfText, parseActivity, type ParsedActivity } from '../../lib/activityImport';
import { aiExtractActivity, mergePreferAi } from '../../lib/aiExtract';
import { readFileAsDataUrl, approxBytes, MAX_ATTACH_BYTES } from '../../lib/attachments';
import { DocViewer } from '../DocViewer';

/**
 * Activities & experiences — booked tours, tickets, and restaurant
 * reservations. Mirrors the Stays tab: import from a receipt/booking PDF
 * (on-device), review the pre-filled details, keep the PDF with the activity.
 * Tap to view; press-and-hold to edit or delete. Costs feed the budget.
 */
export function ActivitiesTab() {
  const activities = useActivities();
  const travelers = useTravelers();
  const trip = useTrip();
  const sheets = useBudgetSheets();
  const cur = trip?.tripCurrency ?? 'EUR';

  // An activity's cost feeds the budget as an auto item; its sheet lives in the
  // trip's autoSheet map (shared with the Budget page), keyed by that item id.
  const sheetOf = (id: string) => trip?.autoSheet?.[`auto-act-${id}`] ?? '';
  async function assignSheet(activityId: string, sheetId: string) {
    if (!trip) return;
    const key = `auto-act-${activityId}`;
    const map = { ...(trip.autoSheet ?? {}) };
    if (sheetId) map[key] = sheetId; else delete map[key];
    await put<TripMeta>({ ...trip, autoSheet: map }, 'Set activity budget sheet');
  }
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [viewing, setViewing] = useState<Activity | null>(null);
  const [pdfView, setPdfView] = useState<{ name: string; mime?: string; dataUrl: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
  const [importDraft, setImportDraft] = useState<Partial<Activity> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<{ found: string[]; provider: string } | null>(null);
  const [importErr, setImportErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportErr('');
    setImporting(true);
    try {
      const text = await extractPdfText(file);
      const local: ParsedActivity = parseActivity(text);
      // AI-assisted read (server-side, key-free) overlays the on-device parse;
      // if it's unavailable we just keep the on-device result.
      const ai = await aiExtractActivity(text);
      const p = mergePreferAi<ParsedActivity>(local, ai as Partial<ParsedActivity> | null);
      if (!p.title && !p.date && !p.confirmation && !p.cost) {
        setImportErr("Couldn't read a booking from that PDF. You can still add it by hand.");
        return;
      }
      let fileData: string | undefined, fileName: string | undefined, fileMime: string | undefined;
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl && approxBytes(dataUrl) <= MAX_ATTACH_BYTES) {
        fileData = dataUrl; fileName = file.name || 'booking.pdf'; fileMime = 'application/pdf';
      }
      const filled = ['title', 'provider', 'date', 'startTime', 'endTime', 'location', 'confirmation', 'cost']
        .filter(k => (p as any)[k]);
      const found = [...filled, ...(ai ? ['AI'] : []), ...(fileData ? ['PDF'] : [])];
      setImportInfo({ found, provider: ai ? 'AI' : (p.provider || 'generic') });
      setImportDraft({
        title: p.title, provider: p.provider, date: p.date, startTime: p.startTime, endTime: p.endTime,
        location: p.location, confirmation: p.confirmation, cost: p.cost, costCurrency: p.costCurrency || cur,
        notes: p.notes, fileData, fileName, fileMime,
      });
    } catch {
      setImportErr('That file could not be read as a PDF.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Activities" subtitle={`${activities.length} booked`}
        gradient="linear-gradient(135deg,#0d9488,#22d3ee)" icon="🎟️" />

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={onPickPdf} />
      <div className="px-4 pt-4">
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-teal-400/50 bg-teal-500/5 text-teal-600 font-semibold active:scale-[0.99] transition disabled:opacity-60">
          {importing ? <><Loader2 size={18} className="animate-spin" /> Reading PDF…</>
            : <><FileUp size={18} /> Import from booking PDF</>}
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-1.5">
          Tours, tickets &amp; reservations — reads it on your device, then you confirm.
        </p>
        {importErr && <p className="text-xs text-sunset text-center mt-2">{importErr}</p>}
      </div>

      {activities.length === 0 ? (
        <EmptyState emoji="🎟️" title="No activities yet" hint="Import tickets, tours & reservations" />
      ) : (
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-slate-400 text-center -mt-1 mb-1">Tap to view · press &amp; hold to edit or delete</p>
          {activities.map(a => (
            <ActivityCard key={a.id} activity={a} currency={cur} author={authorColor(travelers, a)}
              onView={() => setViewing(a)} onEdit={() => setEditing(a)} onDelete={() => setPendingDelete(a)} />
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add activity" />

      {(adding || editing) && (
        <ActivitySheet activity={editing} currency={cur} sheets={sheets}
          initialSheet={editing ? sheetOf(editing.id) : ''} onAssignSheet={assignSheet}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {importDraft && (
        <ActivitySheet activity={null} initial={importDraft} currency={cur} banner={importInfo}
          sheets={sheets} initialSheet="" onAssignSheet={assignSheet}
          onClose={() => { setImportDraft(null); setImportInfo(null); }} />
      )}
      {viewing && (
        <ActivityDetail activity={viewing} currency={cur}
          onClose={() => setViewing(null)}
          onViewPdf={() => viewing.fileData && setPdfView({ name: viewing.fileName || 'booking.pdf', mime: viewing.fileMime, dataUrl: viewing.fileData })} />
      )}
      {pdfView && (
        <DocViewer name={pdfView.name} mime={pdfView.mime} dataUrl={pdfView.dataUrl} onClose={() => setPdfView(null)} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.title}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('activity', pendingDelete.id, `Removed activity: ${pendingDelete.title}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

/* When + times, formatted compactly. */
function whenLabel(a: Activity): string {
  const d = a.date ? fmtDate(a.date) : '';
  const t = a.startTime ? fmtTime(a.startTime) + (a.endTime ? `–${fmtTime(a.endTime)}` : '') : '';
  return [d, t].filter(Boolean).join(' · ');
}

/* Card: tap to view; press-and-hold to reveal edit / delete actions. */
function ActivityCard({ activity: a, currency, author, onView, onEdit, onDelete }: {
  activity: Activity; currency: string; author?: string;
  onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  function clearTimer() { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }
  function onDown(e: React.PointerEvent) {
    if (armed) return;
    start.current = { x: e.clientX, y: e.clientY };
    held.current = false;
    clearTimer();
    timer.current = window.setTimeout(() => { held.current = true; setArmed(true); }, 450);
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clearTimer();
  }
  function onUp() { clearTimer(); start.current = null; }
  useEffect(() => clearTimer, []);

  return (
    <div
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      onClick={() => { if (held.current) { held.current = false; return; } if (armed) setArmed(false); else onView(); }}
      className={`relative bg-white rounded-2xl p-4 shadow-sm active:bg-slate-50 transition ${armed ? 'ring-2 ring-teal-400/60 animate-wiggle' : ''}`}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 truncate" style={{ color: author }}>{a.title}</p>
          {a.provider && <p className="text-sm text-teal-600 font-medium flex items-center gap-1"><Tag size={12} /> {a.provider}</p>}
        </div>
        {armed ? (
          <div className="flex items-center gap-1.5 flex-shrink-0" data-no-drag>
            <button onClick={ev => { ev.stopPropagation(); setArmed(false); onEdit(); }} aria-label="Edit activity"
              className="w-9 h-9 rounded-full bg-teal-500 text-white flex items-center justify-center shadow active:scale-90"><Pencil size={16} /></button>
            <button onClick={ev => { ev.stopPropagation(); setArmed(false); onDelete(); }} aria-label="Delete activity"
              className="w-9 h-9 rounded-full bg-red-50 text-sunset flex items-center justify-center active:scale-90"><Trash2 size={16} /></button>
          </div>
        ) : (
          a.fileData && <FileText size={15} className="text-teal-500/70 flex-shrink-0 mt-0.5" aria-label="Has PDF" />
        )}
      </div>
      {whenLabel(a) && <p className="flex items-center gap-1.5 text-sm text-slate-600 mt-2 font-medium"><Clock size={13} /> {whenLabel(a)}</p>}
      {a.location && <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5"><MapPin size={12} /> {a.location}</p>}
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {a.confirmation && <span>🎫 {a.confirmation}</span>}
        {a.cost > 0 && <span className="ml-auto font-semibold text-slate-700">{money(a.cost, a.costCurrency ?? currency)}</span>}
      </div>
    </div>
  );
}

/* Read-only detail view opened by tapping an activity. */
function ActivityDetail({ activity: a, currency, onClose, onViewPdf }: {
  activity: Activity; currency: string; onClose: () => void; onViewPdf: () => void;
}) {
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
    <Sheet title={a.title || 'Activity'} onClose={onClose}>
      {a.provider && <p className="text-teal-600 font-semibold -mt-1 mb-2 flex items-center gap-1"><Tag size={13} /> {a.provider}</p>}
      <div className="bg-white rounded-2xl">
        {whenLabel(a) && <Row icon={<Clock size={16} />} label="When" value={whenLabel(a)} />}
        {a.location && <Row icon={<MapPin size={16} />} label="Location" value={a.location} />}
        {a.confirmation && <Row icon={<Ticket size={16} />} label="Confirmation" value={a.confirmation} />}
        {a.cost > 0 && <Row icon={<Wallet size={16} />} label="Cost" value={money(a.cost, a.costCurrency ?? currency)} />}
        {a.notes && <Row icon={<FileText size={16} />} label="Notes" value={a.notes} />}
      </div>
      {a.fileData && (
        <button onClick={onViewPdf}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-2xl bg-teal-500/10 text-teal-600 font-semibold active:scale-[0.99] transition">
          <FileText size={18} /> View booking PDF
        </button>
      )}
      <p className="text-[11px] text-slate-400 text-center mt-3">Press &amp; hold the activity in the list to edit or delete it.</p>
    </Sheet>
  );
}

function ActivitySheet({ activity, initial, currency, banner, sheets, initialSheet, onAssignSheet, onClose }: {
  activity: Activity | null; initial?: Partial<Activity>; currency: string;
  banner?: { found: string[]; provider: string } | null;
  sheets: BudgetSheet[]; initialSheet: string; onAssignSheet: (activityId: string, sheetId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const seed = activity ?? initial;
  const [sheetId, setSheetId] = useState(initialSheet);
  const [title, setTitle] = useState(seed?.title ?? '');
  const [provider, setProvider] = useState(seed?.provider ?? '');
  const [date, setDate] = useState(seed?.date || todayStr());
  const [startTime, setStartTime] = useState(seed?.startTime ?? '');
  const [endTime, setEndTime] = useState(seed?.endTime ?? '');
  const [location, setLocation] = useState(seed?.location ?? '');
  const [confirmation, setConfirmation] = useState(seed?.confirmation ?? '');
  const [cost, setCost] = useState(seed?.cost ? String(seed.cost) : '');
  const [costCurrency, setCostCurrency] = useState(seed?.costCurrency || currency);
  const [notes, setNotes] = useState(seed?.notes ?? '');

  async function save() {
    if (!title.trim()) return;
    const isNew = !activity;
    const id = activity?.id ?? crypto.randomUUID();
    await put<Activity>({
      kind: 'activity', id,
      title: title.trim(), provider: provider.trim(), date,
      startTime, endTime, location: location.trim(), confirmation: confirmation.trim(),
      cost: parseFloat(cost) || 0, costCurrency, notes: notes.trim(),
      fileData: seed?.fileData, fileName: seed?.fileName, fileMime: seed?.fileMime,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} activity: ${title.trim()}`, isNew ? 'create' : 'update');
    if (sheetId !== initialSheet) await onAssignSheet(id, sheetId);
    onClose();
  }

  return (
    <Sheet title={activity ? 'Edit activity' : banner ? 'Review imported activity' : 'Add activity'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!title.trim()} submitLabel={banner ? 'Save activity' : activity ? 'Save' : 'Add activity'} />}>
      {banner && (
        <div className="rounded-xl bg-teal-500/5 border border-teal-400/20 p-3 mb-1">
          <p className="text-sm font-semibold text-teal-600">
            {banner.provider === 'AI' ? 'Read with AI ✨' : banner.provider === 'generic' ? 'Booking read' : `${banner.provider} booking read`} · {banner.found.length} field{banner.found.length === 1 ? '' : 's'} filled
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Double-check everything below, then save. Anything the PDF didn’t include is left blank for you to fill.</p>
        </div>
      )}
      <Field label="Activity"><TextInput autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sagrada Família tour" /></Field>
      <Field label="Provider"><TextInput value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. GetYourGuide (optional)" /></Field>
      <Field label="Date"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time"><TextInput type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
        <Field label="End time"><TextInput type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></Field>
      </div>
      <Field label="Location"><PlaceInput value={location} onChange={setLocation} placeholder="Search a place…" /></Field>
      <Field label="Confirmation"><TextInput value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Optional" /></Field>
      <CostField value={cost} onChange={setCost} currency={costCurrency} onCurrencyChange={setCostCurrency} />
      {sheets.length > 0 && (
        <Field label="Budget sheet">
          <Select value={sheetId} onChange={e => setSheetId(e.target.value)}>
            <option value="">🧾 General (whole trip)</option>
            {sheets.map(s => <option key={s.id} value={s.id}>📍 {s.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
      {seed?.fileData && (
        <div className="flex items-center gap-2 text-sm text-teal-600 bg-teal-500/5 rounded-xl px-3 py-2.5">
          <FileText size={16} /> <span className="truncate">{seed.fileName || 'Booking PDF'} kept with this activity</span>
        </div>
      )}
    </Sheet>
  );
}
