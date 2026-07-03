import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useChecklist, useTravelers, travelerName } from '../../hooks/useTrip';
import { put, remove } from '../../db/database';
import type { ChecklistItem, ChecklistCategory } from '../../types';
import { TabHeader, Sheet, Field, TextInput, TextArea, Select, FormFooter, Fab, EmptyState, ConfirmDelete } from '../ui';

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
  const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

  const doneCount = items.filter(i => i.done).length;

  async function toggle(item: ChecklistItem) {
    await put({ ...item, done: !item.done },
      `${item.done ? 'Unchecked' : 'Checked'}: ${item.text}`);
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
              <div className="space-y-2">
                {items.filter(i => i.category === cat.key).map(item => (
                  <div key={item.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 group">
                    <button onClick={() => toggle(item)}
                      className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition ${
                        item.done ? 'bg-mint border-mint text-white' : 'border-slate-300'
                      }`}>
                      {item.done && '✓'}
                    </button>
                    <div className="flex-1 min-w-0" onClick={() => setEditing(item)}>
                      <p className={`font-medium ${item.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.text}</p>
                      {item.notes && (
                        <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{item.notes}</p>
                      )}
                      {item.assignedTo && (
                        <p className="text-xs text-slate-400 mt-0.5">{travelerName(travelers, item.assignedTo)}</p>
                      )}
                    </div>
                    <button onClick={() => setPendingDelete(item)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 transition">
                      <Trash2 size={15} className="text-slate-300 hover:text-sunset" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Add item" />

      {(adding || editing) && <ItemSheet item={editing} travelers={travelers} onClose={() => { setAdding(false); setEditing(null); }} />}
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

  async function save() {
    if (!text.trim()) return;
    const isNew = !item;
    await put<ChecklistItem>({
      kind: 'checklist', id: item?.id ?? crypto.randomUUID(), text: text.trim(), category,
      done: item?.done ?? false, assignedTo: assignedTo || null, dueDate: item?.dueDate ?? '',
      notes: notes.trim(),
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
    </Sheet>
  );
}
