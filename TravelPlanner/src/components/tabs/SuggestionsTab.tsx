import { useMemo, useRef, useState } from 'react';
import {
  Trash2, MapPin, Clock, Link as LinkIcon, Plus, X, Loader, Check,
  Calendar, CheckCircle2, Pencil,
} from 'lucide-react';
import { useSuggestions, useTravelers, useTrip } from '../../hooks/useTrip';
import { put, remove, getDeviceName } from '../../db/database';
import { useMeId, setMeId } from '../../lib/me';
import type { Suggestion, ItineraryEvent, Traveler } from '../../types';
import { money } from '../../types';
import { fmtDate, fmtTime, todayStr } from '../../utils/format';
import {
  TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState,
  ConfirmDelete, CostField,
} from '../ui';
import { PlaceInput } from '../PlaceInput';
import { compressToDataUrl } from '../../lib/photoUpload';

const CATS = [
  { key: 'sightseeing', label: 'Sightseeing', emoji: '📸' },
  { key: 'food',        label: 'Food',        emoji: '🍽️' },
  { key: 'travel',      label: 'Travel',      emoji: '🚆' },
  { key: 'rest',        label: 'Rest',        emoji: '😴' },
  { key: 'event',       label: 'Event',       emoji: '🎫' },
  { key: 'other',       label: 'Other',       emoji: '📍' },
] as const;
type Cat = typeof CATS[number]['key'];
const catEmoji = (k: string) => CATS.find(c => c.key === k)?.emoji ?? '📍';

export function SuggestionsTab() {
  const suggestions = useSuggestions();
  const travelers = useTravelers();
  const trip = useTrip();
  const cur = trip?.tripCurrency ?? 'EUR';

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Suggestion | null>(null);

  // Per-device identity: who is using this phone. When set, you can only
  // approve as yourself; otherwise it falls back to tap-anyone (honour system).
  const meId = useMeId();
  const me = travelers.find(t => t.id === meId) ?? null;

  const memberCount = travelers.length;
  const isApproved = (s: Suggestion) =>
    memberCount > 0 && travelers.every(t => s.approvals?.includes(t.id));

  /** Toggle one member's approval; auto-add to the itinerary once everyone's in. */
  async function toggleApproval(s: Suggestion, traveler: Traveler) {
    if (s.itineraryId) return; // already added — locked
    const has = s.approvals?.includes(traveler.id);
    const approvals = has ? s.approvals.filter(id => id !== traveler.id) : [...(s.approvals ?? []), traveler.id];
    const nowApproved = memberCount > 0 && travelers.every(t => approvals.includes(t.id));
    let itineraryId = s.itineraryId;
    if (nowApproved && !itineraryId) itineraryId = await addToItinerary(s);
    await put<Suggestion>(
      { ...s, approvals, itineraryId, updatedAt: '', updatedBy: '' },
      `${has ? 'Un-approved' : 'Approved'} suggestion: ${s.title}${nowApproved && itineraryId ? ' → added to itinerary' : ''}`,
    );
  }

  /** Create an itinerary event from a fully-approved suggestion; returns its id. */
  async function addToItinerary(s: Suggestion): Promise<string> {
    const id = crypto.randomUUID();
    const date = s.date || trip?.startDate || todayStr();
    const extra = [s.description.trim(), s.notes.trim(), s.link.trim()].filter(Boolean).join('\n');
    await put<ItineraryEvent>({
      kind: 'itinerary', id,
      title: s.title, date, startTime: s.startTime, endTime: '',
      place: s.place, category: (s.category as ItineraryEvent['category']) ?? 'other',
      cost: s.cost || 0, costCurrency: s.costCurrency ?? cur, notes: extra,
      updatedAt: '', updatedBy: '',
    }, `Added approved suggestion to itinerary: ${s.title}`, 'create');
    return id;
  }

  const sorted = useMemo(() => {
    const rank = (s: Suggestion) => (s.itineraryId ? 2 : isApproved(s) ? 1 : 0);
    return [...suggestions].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  }, [suggestions, travelers]); // eslint-disable-line

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Suggestions" subtitle="Ideas the whole group approves" gradient="linear-gradient(135deg,#ca8a04,#eab308)" icon="💡" />

      <div className="px-4 pt-4 space-y-3">
        <p className="text-sm text-muted">Propose things to do. Every member approves — once everyone’s in, the idea turns green and drops straight into the itinerary.</p>

        {/* Who is approving on this device */}
        {travelers.length > 0 && (
          <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3 py-2">
            <span className="text-sm font-semibold text-content flex-shrink-0">You’re</span>
            <select value={meId ?? ''} onChange={e => setMeId(e.target.value || null)}
              className="flex-1 bg-transparent text-sm font-semibold text-accent outline-none">
              <option value="">everyone (tap any name)</option>
              {travelers.map(t => <option key={t.id} value={t.id}>{t.emoji || '🙂'} {t.name}</option>)}
            </select>
            {me && <span className="text-xs text-muted flex-shrink-0">approve as yourself</span>}
          </div>
        )}
      </div>

      {suggestions.length === 0 ? (
        <EmptyState emoji="💡" title="No suggestions yet" hint="Add an idea for the group to vote on" />
      ) : (
        <div className="px-4 py-4 space-y-3">
          {sorted.map(s => (
            <SuggestionCard key={s.id} s={s} travelers={travelers} currency={cur} me={me}
              approved={isApproved(s)} onToggle={toggleApproval}
              onEdit={() => setEditing(s)} onDelete={() => setPendingDelete(s)} />
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Suggest an activity" />

      {(adding || editing) && (
        <SuggestionSheet suggestion={editing} currency={cur} defaultDate={trip?.startDate ?? ''}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.title}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('suggestion', pendingDelete.id, `Removed suggestion: ${pendingDelete.title}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

function SuggestionCard({ s, travelers, currency, me, approved, onToggle, onEdit, onDelete }: {
  s: Suggestion; travelers: Traveler[]; currency: string; me: Traveler | null; approved: boolean;
  onToggle: (s: Suggestion, t: Traveler) => void; onEdit: () => void; onDelete: () => void;
}) {
  const added = !!s.itineraryId;
  const count = travelers.filter(t => s.approvals?.includes(t.id)).length;
  const border = added ? 'border-emerald-400' : 'border-line';
  const bg = added ? 'bg-emerald-50' : 'bg-surface';
  const iApproved = me ? s.approvals?.includes(me.id) : false;

  return (
    <div className={`rounded-2xl border ${border} ${bg} overflow-hidden shadow-sm transition-colors`}>
      {/* Photos */}
      {s.photos?.length > 0 && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {s.photos.map((src, i) => (
            <img key={i} src={src} alt="" className="h-32 w-auto object-cover flex-shrink-0" />
          ))}
        </div>
      )}

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-content flex items-center gap-1.5">
              <span>{catEmoji(s.category)}</span>
              <span className="truncate">{s.title}</span>
              {added && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
            </p>
            {s.proposedBy && <p className="text-[11px] text-muted mt-0.5">Suggested by {s.proposedBy}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-muted active:bg-slate-100" aria-label="Edit">
              <Pencil size={15} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-muted active:bg-red-50" aria-label="Delete">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted">
          {s.date && <span className="flex items-center gap-1"><Calendar size={11} />{fmtDate(s.date)}{s.startTime ? ` · ${fmtTime(s.startTime)}` : ''}</span>}
          {!s.date && s.startTime && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(s.startTime)}</span>}
          {s.place && <span className="flex items-center gap-1"><MapPin size={11} />{s.place}</span>}
          {s.cost > 0 && <span className="font-semibold text-amber">{money(s.cost, s.costCurrency ?? currency)}</span>}
        </div>

        {s.description && <p className="text-sm text-content/80 mt-2 whitespace-pre-wrap">{s.description}</p>}
        {s.notes && <p className="text-xs text-muted mt-1.5 whitespace-pre-wrap">{s.notes}</p>}
        {s.link && (
          <a href={s.link} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-accent break-all">
            <LinkIcon size={13} /> {prettyLink(s.link)}
          </a>
        )}

        {/* Approvals */}
        <div className="mt-3 pt-3 border-t border-line/70">
          {added ? (
            <p className="text-sm font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={16} /> Approved by everyone — added to the itinerary</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted">Approvals</p>
                <span className={`text-xs font-bold ${approved ? 'text-emerald-600' : 'text-muted'}`}>{count}/{travelers.length}</span>
              </div>
              {travelers.length === 0 ? (
                <p className="text-xs text-muted">Add travellers (in Settings) so the group can approve.</p>
              ) : (
                <>
                  {/* Status of every member — tappable only in honour-system mode */}
                  <div className="flex flex-wrap gap-1.5">
                    {travelers.map(t => {
                      const ok = s.approvals?.includes(t.id);
                      const mine = me && t.id === me.id;
                      const chip = (
                        <span className={`flex items-center gap-1 pl-1 pr-2 py-1 rounded-full border text-xs font-semibold ${ok ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'bg-surface border-line text-muted'} ${mine ? 'ring-2 ring-accent/40' : ''}`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {ok ? <Check size={12} /> : (t.emoji || '🙂')}
                          </span>
                          {t.name}{mine ? ' (you)' : ''}
                        </span>
                      );
                      // When no identity is chosen, tapping any chip toggles it.
                      return me
                        ? <div key={t.id}>{chip}</div>
                        : <button key={t.id} onClick={() => onToggle(s, t)} className="active:opacity-70">{chip}</button>;
                    })}
                  </div>

                  {/* Per-traveller approve button (when you've said who you are) */}
                  {me && (
                    <button onClick={() => onToggle(s, me)}
                      className={`mt-2.5 w-full rounded-xl py-2.5 font-bold text-sm flex items-center justify-center gap-1.5 press ${iApproved ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'accent-gradient text-white'}`}>
                      {iApproved ? <><Check size={16} /> You approved · tap to undo</> : <><Check size={16} /> Approve as {me.name}</>}
                    </button>
                  )}
                  {!me && <p className="text-[11px] text-muted mt-2">Pick who you are above to approve just for yourself.</p>}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function prettyLink(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function SuggestionSheet({ suggestion, currency, defaultDate, onClose }: {
  suggestion: Suggestion | null; currency: string; defaultDate: string; onClose: () => void;
}) {
  const travelers = useTravelers();
  const [title, setTitle] = useState(suggestion?.title ?? '');
  const [date, setDate] = useState(suggestion?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(suggestion?.startTime ?? '');
  const [place, setPlace] = useState(suggestion?.place ?? '');
  const [category, setCategory] = useState<Cat>((suggestion?.category as Cat) ?? 'sightseeing');
  const [description, setDescription] = useState(suggestion?.description ?? '');
  const [link, setLink] = useState(suggestion?.link ?? '');
  const [notes, setNotes] = useState(suggestion?.notes ?? '');
  const [cost, setCost] = useState(suggestion ? String(suggestion.cost || '') : '');
  const [costCurrency, setCostCurrency] = useState(suggestion?.costCurrency ?? currency);
  const [photos, setPhotos] = useState<string[]>(suggestion?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const added = await Promise.all(files.map(f => compressToDataUrl(f, 1400, 0.7).catch(() => '')));
      setPhotos(ps => [...ps, ...added.filter(Boolean)]);
    } finally { setBusy(false); }
  }

  async function save() {
    if (!title.trim()) return;
    const isNew = !suggestion;
    await put<Suggestion>({
      kind: 'suggestion', id: suggestion?.id ?? crypto.randomUUID(),
      title: title.trim(), date, startTime, place: place.trim(), category,
      description: description.trim(), link: link.trim(), notes: notes.trim(),
      cost: parseFloat(cost) || 0, costCurrency, photos,
      proposedBy: suggestion?.proposedBy ?? (travelers[0]?.name || getDeviceName()),
      // Editing keeps existing approvals; a material edit could reset them, but we
      // keep them so tweaks don't wipe votes. New suggestions start un-approved.
      approvals: suggestion?.approvals ?? [],
      itineraryId: suggestion?.itineraryId,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Suggested' : 'Updated suggestion'}: ${title.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={suggestion ? 'Edit suggestion' : 'Suggest an activity'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!title.trim()} submitLabel={suggestion ? 'Save' : 'Add suggestion'} />}>
      <Field label="Event name"><TextInput autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sunset boat tour" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Time"><TextInput type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
      </div>
      <Field label="Category">
        <Select value={category} onChange={e => setCategory(e.target.value as Cat)}>
          {CATS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
        </Select>
      </Field>
      <Field label="Location"><PlaceInput value={place} onChange={setPlace} placeholder="Search a location…" /></Field>
      <Field label="Description"><TextArea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's the idea?" /></Field>
      <Field label="External link"><TextInput type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" /></Field>
      <CostField label="Price" value={cost} onChange={setCost} currency={costCurrency} onCurrencyChange={setCostCurrency} />

      <Field label="Pictures">
        <div className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-line">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))} aria-label="Remove picture"
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
      </Field>

      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else the group should know" /></Field>
    </Sheet>
  );
}
