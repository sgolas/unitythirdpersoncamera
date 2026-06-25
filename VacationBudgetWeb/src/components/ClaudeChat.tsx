import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ChevronDown, ChevronUp, Bot, User, Trash2 } from 'lucide-react';
import type { Budget } from '../types';

interface Message { role: 'user' | 'assistant'; content: string; }

const QUICK_PROMPTS = [
  '🗺️ Plan a day-by-day itinerary',
  '🍽️ Best local restaurants to try',
  '🎭 Top attractions & hidden gems',
  '🚌 Local transport tips',
  '🎒 What should I pack?',
  '💡 Budget travel tips',
];

interface Props { budget: Budget; selectedDate: string; }

export function ClaudeChat({ budget, selectedDate }: Props) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

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
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  const hasDestination = Boolean(budget.destination);

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
          {messages.length > 0 && (
            <span className="bg-white/25 text-xs px-2 py-0.5 rounded-full">
              {messages.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && open && (
            <span
              onClick={e => { e.stopPropagation(); setMessages([]); }}
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
          {/* Messages */}
          <div className="h-72 overflow-y-auto p-4 space-y-3 scroll-smooth">
            {messages.length === 0 ? (
              <EmptyChat destination={budget.destination} />
            ) : (
              messages.map((msg, i) => <Bubble key={i} msg={msg} />)
            )}

            {loading && <TypingIndicator />}
            {error && (
              <div className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">⚠️ {error}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts — only when chat is empty */}
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

          {/* Destination hint */}
          {!hasDestination && messages.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 mx-4 mb-3 px-3 py-2 rounded-xl">
              💡 Set a destination in your Budget tab so Claude can give tailored suggestions.
            </p>
          )}

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-slate-100">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={hasDestination ? `Ask about ${budget.destination}…` : 'Ask about your trip…'}
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
      <p className="text-sm text-slate-400 max-w-[220px]">
        {destination
          ? `Ask me anything about your trip to ${destination}!`
          : 'Ask me about activities, restaurants, packing tips and more.'}
      </p>
    </div>
  );
}
