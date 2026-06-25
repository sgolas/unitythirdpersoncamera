import { useState } from 'react';
import { Plus, MapPin, Clock, FileText, ExternalLink, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { Budget, ItineraryEvent } from '../types';
import { EventDialog } from './EventDialog';
import { ClaudeChat } from './ClaudeChat';
import { formatDate, formatTime, buildGCalUrl, gCalDayUrl, getWeekDays, addMonths, todayStr } from '../utils/formatters';

interface Props {
  budget: Budget;
  events: ItineraryEvent[];
  onAddEvent:    (e: ItineraryEvent) => void;
  onUpdateEvent: (e: ItineraryEvent) => void;
  onDeleteEvent: (id: string)       => void;
}

export function ItineraryTab({ budget, events, onAddEvent, onUpdateEvent, onDeleteEvent }: Props) {
  const [selectedDate,  setSelectedDate]  = useState(todayStr());
  const [showDialog,    setShowDialog]    = useState(false);
  const [editingEvent,  setEditingEvent]  = useState<ItineraryEvent | null>(null);

  const today = todayStr();
  const weekDays = getWeekDays(selectedDate);

  const dayEvents = events
    .filter(e => e.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const monthLabel = new Date(selectedDate + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="pb-4">
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #00858A 100%)' }} className="px-6 pt-12 pb-6">
        <p className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1">Linked to Google Calendar</p>
        <h1 className="text-white text-3xl font-bold mb-5">Activity Itinerary</h1>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedDate(addMonths(selectedDate, -1))}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            ‹
          </button>
          <span className="text-white font-semibold text-base">{monthLabel}</span>
          <button
            onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* Week strip */}
      <div className="bg-white shadow-sm px-2 py-3 flex justify-between border-b border-slate-100">
        {weekDays.map(day => {
          const dayLabel   = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2).toUpperCase();
          const dayNum     = new Date(day + 'T00:00:00').getDate();
          const isSelected = day === selectedDate;
          const isToday    = day === today;
          const hasEvents  = events.some(e => e.date === day);

          return (
            <button
              key={day}
              onClick={() => setSelectedDate(day)}
              className={`flex flex-col items-center px-2.5 py-2 rounded-2xl transition-all ${
                isSelected
                  ? 'text-white'
                  : isToday
                  ? 'text-vteal border-2 border-vteal'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
              style={isSelected ? { background: 'linear-gradient(135deg, #2EC4B6, #00858A)' } : {}}
            >
              <span className="text-xs font-medium">{dayLabel}</span>
              <span className="text-base font-bold mt-0.5">{dayNum}</span>
              {hasEvents && (
                <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-vteal'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Claude AI chat */}
      <div className="pt-4">
        <ClaudeChat budget={budget} selectedDate={selectedDate} />
      </div>

      {/* Day header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2 className="font-bold text-slate-800 text-lg">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
          </h2>
          <p className="text-slate-400 text-sm">{formatDate(selectedDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          {dayEvents.length > 0 && (
            <span className="bg-vteal/15 text-vteal text-xs font-semibold px-2.5 py-1 rounded-full">
              {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
            </span>
          )}
          <a
            href={gCalDayUrl(selectedDate)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-vteal transition-colors"
          >
            <CalendarDays size={14} /> Google Cal
          </a>
        </div>
      </div>

      {/* Events */}
      {dayEvents.length === 0 ? (
        <EmptyDay date={selectedDate} onAdd={() => setShowDialog(true)} />
      ) : (
        <div className="px-4 space-y-3">
          {dayEvents.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              onEdit={() => setEditingEvent(event)}
              onDelete={() => onDeleteEvent(event.id)}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowDialog(true)}
        className="fixed bottom-20 right-4 flex items-center gap-2 text-white px-5 py-3 rounded-2xl shadow-lg font-semibold transition-all active:scale-95 z-40"
        style={{ background: 'linear-gradient(135deg, #2EC4B6, #00858A)' }}
      >
        <Plus size={20} /> Add Activity
      </button>

      {/* Dialogs */}
      {showDialog && (
        <EventDialog
          event={null}
          defaultDate={selectedDate}
          onSave={e => { onAddEvent(e); setShowDialog(false); }}
          onClose={() => setShowDialog(false)}
        />
      )}
      {editingEvent && (
        <EventDialog
          event={editingEvent}
          onSave={e => { onUpdateEvent(e); setEditingEvent(null); }}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

const CARD_COLORS = ['#2EC4B6', '#0077B6', '#FF6B35', '#7E57C2', '#EC407A', '#42A5F5'];

function EventCard({ event, index, onEdit, onDelete }: {
  event: ItineraryEvent; index: number; onEdit: () => void; onDelete: () => void;
}) {
  const accentColor = CARD_COLORS[index % CARD_COLORS.length];

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex group">
      {/* Color bar */}
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: accentColor }} />

      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-800 text-base leading-tight">{event.title}</p>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <Pencil size={13} className="text-slate-400" />
            </button>
            <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} className="text-red-400" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock size={12} style={{ color: accentColor }} />
            <span>{formatTime(event.startTime)} – {formatTime(event.endTime)}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin size={12} style={{ color: accentColor }} />
              <span className="truncate max-w-[160px]">{event.location}</span>
            </div>
          )}
        </div>

        {event.description && (
          <div className="flex items-start gap-1 mt-2 text-xs text-slate-400">
            <FileText size={11} className="mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{event.description}</span>
          </div>
        )}

        {/* Google Calendar link */}
        <a
          href={buildGCalUrl(event)}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ backgroundColor: accentColor + '15', color: accentColor }}
        >
          <ExternalLink size={11} /> Add to Google Calendar
        </a>
      </div>
    </div>
  );
}

function EmptyDay({ date, onAdd }: { date: string; onAdd: () => void }) {
  const today = todayStr();
  const isPast = date < today;

  return (
    <div className="flex flex-col items-center py-14 px-8 text-center">
      <span className="text-6xl mb-4">{isPast ? '📋' : '🗓️'}</span>
      <p className="font-semibold text-slate-700 text-lg">No activities planned</p>
      <p className="text-slate-400 text-sm mt-1">
        {isPast
          ? `No activities were planned for ${formatDate(date)}`
          : `Plan your activities for ${formatDate(date)}`}
      </p>
      {!isPast && (
        <button
          onClick={onAdd}
          className="mt-6 flex items-center gap-2 border-2 border-dashed border-slate-300 text-slate-500 hover:border-vteal hover:text-vteal px-5 py-2.5 rounded-xl font-medium transition-colors"
        >
          <Plus size={18} /> Add Activity
        </button>
      )}
    </div>
  );
}
