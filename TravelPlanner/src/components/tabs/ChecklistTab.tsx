import { useState } from 'react';
import { User, FileText } from 'lucide-react';
import { useChecklist, useTravelers, travelerName } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { ChecklistItem, ChecklistCategory } from '../../types';
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

export function ChecklistTab() {
  const items = useChecklist();
  const travelers = useTravelers();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [viewing, setViewing] = useState<ChecklistItem | null>(null);
  const [pdfView, setPdfView] = useState<{ name: string; mime?: string; dataUrl: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

  const doneCount = items.filter(i => i.done).length;

  async function toggle(item: ChecklistItem) {
    await put({ ...item, done: !item.done },
      `${item.done ? 'Unchecked' : 'Checked'}: ${item.text}`);
  }
  function reorderCat(ids: string[]) {
    ids.forEach((id, i) => { const it = items.find(x => x.id === id); if (it && it.order !== i) put<ChecklistItem>({ ...it, order: i }, 'Reordered checklist', 'update'); });
  }

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Checklist" subtitle={`${doneCount}/${items.length} done`}
        gradient="linear-gradient(135deg,#059669,#34d399)" icon="✅" />

      {/* progress bar */}
      {items.length > 0 && (
        <div className="px-5 pt-4">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-mint transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState emoji="🧳" title="Nothing to pack yet" hint="Add your first checklist item" />
      ) : (
        <div className="px-4 py-4 space-y-4">
          {CATS.filter(c => items.some(i => i.category === c.key)).map(cat => (
            <div key={cat.key}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 mb-1.5">
                {cat.emoji} {cat.label}
              </p>
              <ReorderProvider ids={items.filter(i => i.category === cat.key).map(i => i.id)} onReorder={reorderCat} className="space-y-2">
                {items.filter(i => i.category === cat.key).map(item => (
                  <HoldCard key={item.id} id={item.id} accent="#059669" hasDoc={!!item.fileData}
                    onView={() => setViewing(item)} onEdit={() => setEditing(item)} onDelete={() => setPendingDelete(item)}
                    className="!px-4 !py-3 flex items-center gap-3">
                    <button data-no-drag onClick={e => { e.stopPropagation(); toggle(item); }}
                      className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition ${
                        item.done ? 'bg-mint border-mint text-white' : 'border-slate-300'
                      }`}>
                      {item.done && '✓'}
                    </button>
                    <div className="flex-1 min-w-0 pr-16">
                      <p className={`font-medium ${item.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.text}</p>
                      {item.notes && (
                        <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{item.notes}</p>
                      )}
                      {item.assignedTo && (
                        <p className="text-xs text-slate-400 mt-0.5">{travelerName(travelers, item.assignedTo)}</p>
                      )}
                    </div>
                  </HoldCard>
                ))}
              </ReorderProvider>
            </div>
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add item" />

      {(adding || editing) && <ItemSheet item={editing} travelers={travelers} onClose={() => { setAdding(false); setEditing(null); }} />}
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

function ItemSheet({ item, travelers, onClose }: { item: ChecklistItem | null; travelers: any[]; onClose: () => void }) {
  const [text, setText] = useState(item?.text ?? '');
  const [category, setCategory] = useState<ChecklistCategory>(item?.category ?? 'packing');
  const [assignedTo, setAssignedTo] = useState(item?.assignedTo ?? '');
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
      <Field label="Assign to">
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
