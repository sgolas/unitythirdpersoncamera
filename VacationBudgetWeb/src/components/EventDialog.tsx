import { useState, useEffect } from 'react';
import { X, FileText, Calendar, Clock, ExternalLink } from 'lucide-react';
import { ItineraryEvent } from '../types';
import { Overlay } from './BudgetDialog';
import { LocationInput } from './LocationInput';
import { todayStr } from '../utils/formatters';

interface Props {
  event: ItineraryEvent | null;
  defaultDate?: string;
  onSave: (e: ItineraryEvent) => void;
  onClose: () => void;
}

const DRAFT_KEY = 'draft_event';

export function EventDialog({ event, defaultDate, onSave, onClose }: Props) {
  const isEditing = event !== null;

  function getInitial() {
    if (isEditing) return null;
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
  }
  const draft = getInitial();

  const [title,       setTitle]       = useState(event?.title       ?? draft?.title       ?? '');
  const [description, setDescription] = useState(event?.description ?? draft?.description ?? '');
  const [location,    setLocation]    = useState(event?.location    ?? draft?.location    ?? '');
  const [date,        setDate]        = useState(event?.date        ?? draft?.date        ?? defaultDate ?? todayStr());
  const [startTime,   setStartTime]   = useState(event?.startTime   ?? draft?.startTime   ?? '09:00');
  const [endTime,     setEndTime]     = useState(event?.endTime     ?? draft?.endTime     ?? '10:00');
  const [titleErr,    setTitleErr]    = useState(false);

  // Persist draft while typing (new events only)
  useEffect(() => {
    if (isEditing) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, location, date, startTime, endTime }));
  }, [title, description, location, date, startTime, endTime, isEditing]);

  function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }

  function handleSave() {
    if (title.trim() === '') { setTitleErr(true); return; }
    clearDraft();
    onSave({
      id:          event?.id ?? crypto.randomUUID(),
      title:       title.trim(),
      description: description.trim(),
      location:    location.trim(),
      date,
      startTime,
      endTime,
    });
  }

  function handleClose() { clearDraft(); onClose(); }

  return (
    <Overlay onClose={handleClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-slate-800">{isEditing ? 'Edit Activity' : 'New Activity'}</h2>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="field-label">Activity Name <span className="text-red-400">*</span></label>
            <input
              value={title} onChange={e => { setTitle(e.target.value); setTitleErr(false); }}
              placeholder="e.g. Louvre Museum Tour"
              className={`input-base ${titleErr ? 'border-red-400' : ''}`}
            />
            {titleErr && <p className="text-xs text-red-500 mt-1">Title is required</p>}
          </div>

          <div>
            <label className="field-label">Date</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-base pl-9" />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="field-label">Start Time</label>
              <div className="relative">
                <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-base pl-9" />
              </div>
            </div>
            <div className="flex-1">
              <label className="field-label">End Time</label>
              <div className="relative">
                <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-base pl-9" />
              </div>
            </div>
          </div>

          {/* Location with search + GPS */}
          <div>
            <label className="field-label">Location</label>
            <LocationInput
              value={location}
              onChange={setLocation}
              placeholder="Search for a place or use GPS…"
            />
          </div>

          <div>
            <label className="field-label">Notes</label>
            <div className="relative">
              <FileText size={16} className="absolute left-3 top-3 text-slate-400" />
              <textarea
                value={description} onChange={e => setDescription(e.target.value)}
                rows={2} placeholder="Tickets booked, dress code, tips..."
                className="input-base pl-9 resize-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-xl text-sm text-teal-700">
            <ExternalLink size={15} className="flex-shrink-0 text-teal-500" />
            <span>After saving, use the <strong>Add to Google Calendar</strong> button on the event card.</span>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleClose} className="btn-outline flex-1">Cancel</button>
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #2EC4B6, #00858A)' }}
          >
            <Calendar size={16} /> {isEditing ? 'Update' : 'Add Activity'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
