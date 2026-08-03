import { useState, useEffect } from 'react';
import { User, FileText, Plus, ListPlus } from 'lucide-react';
import { useChecklist, useTravelers, travelerName, travelerColor, authorColor } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { ChecklistItem, ChecklistCategory, Traveler } from '../../types';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';
import { ReorderProvider, HoldCard, DetailSheet, DocField, type DetailRow } from '../cardKit';
import { DocViewer } from '../DocViewer';

const CATS: { key: ChecklistCategory; label: string; emoji: string }[] = [
  { key: 'packing',        label: 'Packing',        emoji: '🧳' },
  { key: 'before-leaving', label: 'Before Leaving', emoji: '🏠' },
  { key: 'reservations',   label: 'Reservations',   emoji: '📅' },
  { key: 'documents',      label: 'Documents',      emoji: '📄' },
  { key: 'health',         label: 'Health',         emoji: '💊' },
  { key: 'tech',           label: 'Tech',           emoji: '🔌' },
  { key: 'other',          label: 'Other',          emoji: '📌' },
];
const catMeta = (k: ChecklistCategory) => CATS.find(c => c.key === k)!;

const SHEET_KEY = 'trip.checklistSheet'; // 'everyone' | traveler id

export function ChecklistTab() {
  const items = useChecklist();
  const travelers = useTravelers();
  const [adding, setAdding] = useState(false);  // the add-mode chooser sheet
  const [single, setSingle] = useState(false);  // single-item form
  const [bulk, setBulk] = useState(false);      // bulk-add form
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [viewing, setViewing] = useState<ChecklistItem | null>(null);
  const [pdfView, setPdfView] = useState<{ name: string; mime?: string; dataUrl: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

  // Which "sheet" is showing — Everyone, or one traveler. Remembered across visits.
  const [sheet, setSheet] = useState<string>(() => localStorage.getItem(SHEET_KEY) ?? 'everyone');
  useEffect(() => { localStorage.setItem(SHEET_KEY, sheet); }, [sheet]);
  // If the selected traveler is deleted, fall back to Everyone.
  useEffect(() => {
    if (sheet !== 'everyone' && travelers.length && !travelers.find(t => t.id === sheet)) setSheet('everyone');
  }, [sheet, travelers]);

  const isEveryone = sheet === 'everyone';
  const shown = isEveryone ? items : items.filter(i => i.assignedTo === sheet);
  const doneCount = shown.filter(i => i.done).length;
  const activeTraveler = travelers.find(t => t.id === sheet) || null;

  async function toggle(item: ChecklistItem) {
    await put({ ...item, done: !item.done },
      `${item.done ? 'Unchecked' : 'Checked'}: ${item.text}`);
  }
  function reorderCat(ids: string[]) {
    ids.forEach((id, i) => { const it = items.find(x => x.id === id); if (it && it.order !== i) put<ChecklistItem>({ ...it, order: i }, 'Reordered checklist', 'update'); });
  }

  const subtitle = isEveryone
    ? `${doneCount}/${shown.length} done · everyone`
    : `${doneCount}/${shown.length} done · ${activeTraveler?.name ?? ''}`;

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Checklist" subtitle={subtitle}
        gradient="linear-gradient(135deg,#059669,#34d399)" icon="✅" />

      {/* Traveler sheet switcher */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        <SheetChip label="👥 Everyone" active={isEveryone} color="#059669" onClick={() => setSheet('everyone')} />
        {travelers.map(t => (
          <SheetChip key={t.id} label={t.name} active={sheet === t.id}
            color={travelerColor(travelers, t.id)} onClick={() => setSheet(t.id)} />
        ))}
      </div>

      {/* progress bar */}
      {shown.length > 0 && (
        <div className="px-5 pt-3">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full transition-all"
              style={{ width: `${(doneCount / shown.length) * 100}%`, background: isEveryone ? '#34d399' : travelerColor(travelers, sheet) }} />
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState emoji="🧳"
          title={isEveryone ? 'Nothing to pack yet' : `Nothing for ${activeTraveler?.name ?? 'them'} yet`}
          hint="Tap + to add one, or use Bulk add for a whole list" />
      ) : (
        <div className="px-4 py-4 space-y-4">
          {CATS.filter(c => shown.some(i => i.category === c.key)).map(cat => (
            <div key={cat.key}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 mb-1.5">
                {cat.emoji} {cat.label}
              </p>
              <ReorderProvider ids={shown.filter(i => i.category === cat.key).map(i => i.id)} onReorder={reorderCat} className="space-y-2">
                {shown.filter(i => i.category === cat.key).map(item => {
                  const assignee = travelers.find(t => t.id === item.assignedTo) || null;
                  const titleColor = authorColor(travelers, item)
                    ?? (item.assignedTo ? travelerColor(travelers, item.assignedTo) : undefined);
                  return (
                    <HoldCard key={item.id} id={item.id} accent="#059669" hasDoc={!!item.fileData}
                      onView={() => setViewing(item)} onEdit={() => setEditing(item)} onDelete={() => setPendingDelete(item)}
                      className="!px-4 !py-3 flex items-center gap-3">
                      <button data-no-drag onClick={e => { e.stopPropagation(); toggle(item); }}
                        className="w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition text-white"
                        style={item.done
                          ? { background: assignee ? travelerColor(travelers, assignee.id) : '#10b981', borderColor: assignee ? travelerColor(travelers, assignee.id) : '#10b981' }
                          : { borderColor: '#cbd5e1' }}>
                        {item.done && '✓'}
                      </button>
                      <div className="flex-1 min-w-0 pr-16">
                        <p className={`font-medium ${item.done ? 'line-through opacity-50' : ''}`}
                          style={{ color: item.done ? '#94a3b8' : (titleColor ?? '#1e293b') }}>{item.text}</p>
                        {item.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{item.notes}</p>
                        )}
                        {isEveryone && assignee && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold mt-1"
                            style={{ color: travelerColor(travelers, assignee.id) }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: travelerColor(travelers, assignee.id) }} />
                            {assignee.name}
                          </span>
                        )}
                      </div>
                    </HoldCard>
                  );
                })}
              </ReorderProvider>
            </div>
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add item" />

      {/* Add menu: single or bulk */}
      {adding && !editing && (
        <Sheet title="Add to checklist" onClose={() => setAdding(false)}>
          <button onClick={() => { setAdding(false); setEditing(null); setBulk(false); setSingle(true); }}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 mb-2 text-left">
            <span className="w-10 h-10 rounded-xl bg-mint/15 text-mint flex items-center justify-center"><Plus size={20} /></span>
            <span><span className="block font-semibold text-slate-800">Add one item</span>
              <span className="block text-xs text-slate-400">A single checklist item with details</span></span>
          </button>
          <button onClick={() => { setAdding(false); setBulk(true); }}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 text-left">
            <span className="w-10 h-10 rounded-xl bg-mint/15 text-mint flex items-center justify-center"><ListPlus size={20} /></span>
            <span><span className="block font-semibold text-slate-800">Bulk add</span>
              <span className="block text-xs text-slate-400">Paste a list — one item per line</span></span>
          </button>
        </Sheet>
      )}

      {single && <ItemSheet item={null} travelers={travelers} defaultAssignee={isEveryone ? '' : sheet}
        onClose={() => setSingle(false)} />}
      {editing && <ItemSheet item={editing} travelers={travelers} defaultAssignee={editing.assignedTo ?? ''}
        onClose={() => setEditing(null)} />}
      {bulk && <BulkAddSheet travelers={travelers} items={items} defaultAssignee={isEveryone ? '' : sheet}
        onClose={() => setBulk(false)} />}

      {viewing && (() => {
        const c = catMeta(viewing.category);
        const rows: DetailRow[] = [
          { label: 'Category', value: `${c.emoji} ${c.label}` },
          { label: 'Status', value: viewing.done ? '✅ Done' : '⬜ Not done' },
          { icon: <User size={16} />, label: 'Assigned to', value: viewing.assignedTo ? travelerName(travelers, viewing.assignedTo) : 'Everyone' },
          { icon: <FileText size={16} />, label: 'Notes', value: viewing.notes || '' },
        ];
        return (
          <DetailSheet title={viewing.text} rows={rows}
            file={viewing.fileData} fileName={viewing.fileName}
            onViewDoc={() => viewing.fileData && setPdfView({ name: viewing.fileName || 'document.pdf', mime: viewing.fileMime, dataUrl: viewing.fileData })}
            note="Tap the box to check it off · press & hold to edit, delete or drag."
            onClose={() => setViewing(null)} />
        );
      })()}
      {pdfView && <DocViewer name={pdfView.name} mime={pdfView.mime} dataUrl={pdfView.dataUrl} onClose={() => setPdfView(null)} />}
      {pendingDelete && (
        <ConfirmDelete label={`"${pendingDelete.text}"`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => { await remove('checklist', pendingDelete.id, `Removed: ${pendingDelete.text}`); setPendingDelete(null); }} />
      )}
    </div>
  );
}

/** A pill in the traveler-sheet switcher. */
function SheetChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold border-2 transition whitespace-nowrap ${active ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 active:bg-slate-50'}`}
      style={active ? { background: color } : { color: active ? undefined : color }}>
      {label}
    </button>
  );
}

function ItemSheet({ item, travelers, defaultAssignee, onClose }: {
  item: ChecklistItem | null; travelers: Traveler[]; defaultAssignee: string; onClose: () => void;
}) {
  const [text, setText] = useState(item?.text ?? '');
  const [category, setCategory] = useState<ChecklistCategory>(item?.category ?? 'packing');
  const [assignedTo, setAssignedTo] = useState(item?.assignedTo ?? defaultAssignee ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [file, setFile] = useState({ data: item?.fileData, name: item?.fileName, mime: item?.fileMime });

  async function save() {
    if (!text.trim()) return;
    const isNew = !item;
    await put<ChecklistItem>({
      kind: 'checklist', id: item?.id ?? crypto.randomUUID(), text: text.trim(), category,
      done: item?.done ?? false, assignedTo: assignedTo || null, dueDate: item?.dueDate ?? '',
      notes: notes.trim(), order: item?.order,
      fileData: file.data, fileName: file.name, fileMime: file.mime,
      updatedAt: '', updatedBy: '',
    }, `${isNew ? 'Added' : 'Updated'} ${catMeta(category).label.toLowerCase()} item: ${text.trim()}`, isNew ? 'create' : 'update');
    onClose();
  }

  return (
    <Sheet title={item ? 'Edit item' : 'Add checklist item'} onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!text.trim()} submitLabel={item ? 'Save' : 'Add item'} />}>
      <Field label="Item"><TextInput autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Passport, Chargers, Sunscreen" /></Field>
      <Field label="Category">
        <Select value={category} onChange={e => setCategory(e.target.value as ChecklistCategory)}>
          {CATS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
        </Select>
      </Field>
      <Field label="Assign to (which sheet)">
        <Select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
          <option value="">Everyone</option>
          {travelers.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Confirmation #, details, links…" /></Field>
      <DocField file={file.data} fileName={file.name}
        onPick={(data, name, mime) => setFile({ data, name, mime })}
        onClear={() => setFile({ data: undefined, name: undefined, mime: undefined })} />
    </Sheet>
  );
}

/** Add many items at once — one per line — all sharing a category and sheet. */
function BulkAddSheet({ travelers, items, defaultAssignee, onClose }: {
  travelers: Traveler[]; items: ChecklistItem[]; defaultAssignee: string; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ChecklistCategory>('packing');
  const [assignedTo, setAssignedTo] = useState(defaultAssignee ?? '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  async function save() {
    if (!lines.length) return;
    let order = Math.max(-1, ...items.map(i => i.order ?? -1));
    for (const line of lines) {
      order += 1;
      await put<ChecklistItem>({
        kind: 'checklist', id: crypto.randomUUID(), text: line, category,
        done: false, assignedTo: assignedTo || null, dueDate: '', notes: '', order,
        updatedAt: '', updatedBy: '',
      }, `Added ${catMeta(category).label.toLowerCase()} item: ${line}`, 'create');
    }
    onClose();
  }

  return (
    <Sheet title="Bulk add items" onClose={onClose}
      footer={<FormFooter onCancel={onClose} onSubmit={save} disabled={!lines.length}
        submitLabel={lines.length ? `Add ${lines.length} item${lines.length > 1 ? 's' : ''}` : 'Add items'} />}>
      <Field label="One item per line">
        <TextArea autoFocus value={text} onChange={e => setText(e.target.value)} rows={8}
          placeholder={'Passport\nChargers\nSunscreen\nAdapters\nSnacks'} />
      </Field>
      <Field label="Category (applies to all)">
        <Select value={category} onChange={e => setCategory(e.target.value as ChecklistCategory)}>
          {CATS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
        </Select>
      </Field>
      <Field label="Assign to (which sheet)">
        <Select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
          <option value="">Everyone</option>
          {travelers.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </Select>
      </Field>
      {lines.length > 0 && (
        <p className="text-xs text-slate-400 mt-1">{lines.length} item{lines.length > 1 ? 's' : ''} ready to add.</p>
      )}
    </Sheet>
  );
}
