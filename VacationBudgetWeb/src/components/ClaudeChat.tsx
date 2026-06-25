import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ChevronDown, ChevronUp, Bot, User, Trash2, CheckCircle, XCircle, CalendarPlus, Pencil } from 'lucide-react';
import type { Budget, ItineraryEvent } from '../types';
import { formatTime } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';

interface Message { role: 'user' | 'assistant'; content: string; }

interface ToolCall {
  type: 'add_event' | 'update_event';
  id: string;
  input: Partial<ItineraryEvent> & { id?: string };
  status: 'pending' | 'confirmed' | 'dismissed';
}

const QUICK_PROMPTS = [
  '🗺️ Plan a day-by-day itinerary',
  '🍽️ Best local restaurants to try',
  '🎭 Top attractions & hidden gems',
  '🚌 Local transport tips',
  '🎒 What should I pack?',
  '💡 Budget travel tips',
];

interface Props {
  budget: Budget;
  selectedDate: string;
  events: ItineraryEvent[];
  onAddEvent: (e: ItineraryEvent) => void;
  onUpdateEvent: (e: ItineraryEvent) => void;
}

export function ClaudeChat({ budget, selectedDate, events, onAddEvent, onUpdateEvent }: Props) {
  const { user } = useAuth();
  const storageKey = user ? `chatHistory_${user.id}` : null;

  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const { messages: saved_msgs } = JSON.parse(saved);
        if (Array.isArray(saved_msgs) && saved_msgs.length > 0) setMessages(saved_msgs);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ messages }));
  }, [messages, storageKey]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolCalls, open, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError('');

    const userMsg: Message = { role: 'user', content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/.netlify/functions/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated,
          destination: budget.destination || undefined,
          tripName: budget.tripName,
          events,
          selectedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');

      if (data.content) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      }

      if (data.toolCalls?.length > 0) {
        const pending: ToolCall[] = data.toolCalls.map((tc: any) => ({
          type: tc.type,
          id: tc.id,
          input: tc.input,
          status: 'pending',
        }));
        setToolCalls(prev => [...prev, ...pending]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function confirmToolCall(toolId: string) {
    const tc = toolCalls.find(t => t.id === toolId);
    if (!tc) return;

    if (tc.type === 'add_event') {
      const newEvent: ItineraryEvent = {
        id: crypto.randomUUID(),
        title: tc.input.title ?? 'Untitled',
        description: tc.input.description ?? '',
        location: tc.input.location ?? '',
        date: tc.input.date ?? selectedDate,
        startTime: tc.input.startTime ?? '09:00',
        endTime: tc.input.endTime ?? '10:00',
      };
      onAddEvent(newEvent);
    } else if (tc.type === 'update_event' && tc.input.id) {
      const existing = events.find(e => e.id === tc.input.id);
      if (existing) {
        onUpdateEvent({ ...existing, ...tc.input as Partial<ItineraryEvent> });
      }
    }

    setToolCalls(prev => prev.map(t => t.id === toolId ? { ...t, status: 'confirmed' } : t));
  }

  function dismissToolCall(toolId: string) {
    setToolCalls(prev => prev.map(t => t.id === toolId ? { ...t, status: 'dismissed' } : t));
  }

  function clearChat() {
    setMessages([]);
    setToolCalls([]);
    if (storageKey) localStorage.removeItem(storageKey);
  }

  const hasDestination = Boolean(budget.destination);
  const pendingCount = toolCalls.filter(t => t.status === 'pending').length;

  return (
    <div className="mx-4 mb-4">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-white font-semibold shadow-md transition-all active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} />
          <span>AI Travel Assistant</span>
          {pendingCount > 0 && (
            <span className="bg-amber-400 text-amber-900 text-xs px-2 py-0.5 rounded-full font-bold">
              {pendingCount} pending
            </span>
          )}
          {messages.length > 0 && pendingCount === 0 && (
            <span className="bg-white/25 text-xs px-2 py-0.5 rounded-full">
              {messages.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(messages.length > 0 || toolCalls.length > 0) && open && (
            <span
              onClick={e => { e.stopPropagation(); clearChat(); }}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </span>
          )}
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-100 shadow-lg fade-in overflow-hidden">
          <div className="h-72 overflow-y-auto p-4 space-y-3 scroll-smooth">
            {messages.length === 0 && toolCalls.length === 0 ? (
              <EmptyChat destination={budget.destination} />
            ) : (
              <>
                {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
                {toolCalls.map(tc => (
                  <ToolCallCard
                    key={tc.id}
                    toolCall={tc}
                    events={events}
                    onConfirm={() => confirmToolCall(tc.id)}
                    onDismiss={() => dismissToolCall(tc.id)}
                  />
                ))}
              </>
            )}

            {loading && <TypingIndicator />}
            {error && (
              <div className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">⚠️ {error}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length === 0 && (
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="flex-shrink-0 text-xs px-3 py-1.5 bg-violet-50 text-violet-700 rounded-full hover:bg-violet-100 transition-colors border border-violet-200 whitespace-nowrap"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {!hasDestination && messages.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 mx-4 mb-3 px-3 py-2 rounded-xl">
              💡 Set a destination in your Budget tab for tailored suggestions.
            </p>
          )}

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-slate-100">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={hasDestination ? `Ask about ${budget.destination} or say "add an event"…` : 'Ask about your trip or say "add an event"…'}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
              disabled={loading}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: '#7C3AED' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tool call confirmation card ─────────────────────────── */

function ToolCallCard({ toolCall, events, onConfirm, onDismiss }: {
  toolCall: ToolCall;
  events: ItineraryEvent[];
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const isAdd = toolCall.type === 'add_event';
  const input = toolCall.input;
  const existingEvent = !isAdd && input.id ? events.find(e => e.id === input.id) : null;

  const label = isAdd ? 'Add to calendar' : `Edit: ${existingEvent?.title ?? 'event'}`;
  const Icon = isAdd ? CalendarPlus : Pencil;
  const accentColor = isAdd ? '#2EC4B6' : '#0077B6';

  if (toolCall.status === 'confirmed') {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2">
        <CheckCircle size={14} /> {isAdd ? 'Added to calendar' : 'Event updated'}
        {input.title && `: "${input.title}"`}
      </div>
    );
  }

  if (toolCall.status === 'dismissed') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
        <XCircle size={14} /> Dismissed
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: accentColor + '40' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: accentColor + '15' }}>
        <Icon size={14} style={{ color: accentColor }} />
        <span className="text-xs font-bold" style={{ color: accentColor }}>{label}</span>
      </div>

      {/* Event details */}
      <div className="px-3 py-2.5 text-xs text-slate-600 space-y-1">
        {input.title && <p className="font-semibold text-slate-800 text-sm">{input.title}</p>}
        {input.date && (
          <p>📅 {new Date(input.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
        )}
        {(input.startTime || input.endTime) && (
          <p>🕐 {input.startTime ? formatTime(input.startTime) : '?'} – {input.endTime ? formatTime(input.endTime) : '?'}</p>
        )}
        {input.location && <p>📍 {input.location}</p>}
        {input.description && <p className="text-slate-400 italic">{input.description}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-3 pb-3">
        <button
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold transition-all active:scale-95"
          style={{ backgroundColor: accentColor }}
        >
          <CheckCircle size={13} /> {isAdd ? 'Add to Calendar' : 'Apply Changes'}
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white ${isUser ? 'bg-ocean' : 'bg-violet-600'}`}>
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div
        className={`max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-ocean text-white rounded-2xl rounded-tr-none'
            : 'bg-slate-100 text-slate-800 rounded-2xl rounded-tl-none'
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white flex-shrink-0">
        <Bot size={13} />
      </div>
      <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-tl-none flex gap-1.5 items-center">
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyChat({ destination }: { destination: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-4">
      <span className="text-4xl">✨</span>
      <p className="font-semibold text-slate-700">Your AI travel planner</p>
      <p className="text-sm text-slate-400 max-w-[240px]">
        {destination
          ? `Ask me anything about ${destination}, or say "add a visit to the Colosseum at 10am tomorrow"`
          : 'Ask about activities, restaurants, or say "add an event to my calendar"'}
      </p>
    </div>
  );
}
