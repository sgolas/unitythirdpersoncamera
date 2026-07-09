import { useEffect, useRef, useState } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { useChat, useTravelers } from '../../hooks/useTrip';
import { db, getDeviceName } from '../../db/database';
import type { ChatMessage } from '../../types';
import { TabHeader } from '../ui';
import { syncNow } from '../../db/sync';
import { isSyncConfigured } from '../../lib/config';
import { chatDeviceId, setChatOpen, markChatSeen } from '../../lib/chatUnread';

/**
 * Family chat — messages are ordinary synced records (kind 'chatmsg'), so
 * everyone on the trip code sees them. While this tab is open the app pulls
 * new messages every 25 seconds, and sending pushes immediately, so it feels
 * live without any extra backend. Messages stay within the family's own sync
 * relay like everything else.
 */

const ME_KEY = 'chat.me';

function timeOf(iso: string): string { return iso.slice(11, 16); }
function dayOf(iso: string): string { return iso.slice(0, 10); }
function dayLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return 'Today';
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === yest) return 'Yesterday';
  return new Date(day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ChatTab() {
  const msgs = useChat();
  const travelers = useTravelers();
  const [text, setText] = useState('');
  const [me, setMe] = useState(localStorage.getItem(ME_KEY) || '');
  const [pulling, setPulling] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const device = getDeviceName();
  const myId = chatDeviceId();
  const configured = isSyncConfigured();

  const meName = me || device;
  const meEmoji = travelers.find(t => t.name === meName)?.emoji || '💬';

  function pickMe(name: string) {
    setMe(name);
    localStorage.setItem(ME_KEY, name);
  }

  // Pull messages when the chat opens, then every 25s while it's open.
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const pull = async () => { if (!alive) return; setPulling(true); await syncNow(); if (alive) setPulling(false); };
    pull();
    const t = setInterval(pull, 25_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest message in view.
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  // While this tab is open, suppress notification popups and mark everything
  // read as it comes in (clears the unread badge + dashboard banner).
  useEffect(() => { setChatOpen(true); return () => setChatOpen(false); }, []);
  useEffect(() => { if (msgs.length) markChatSeen(msgs[msgs.length - 1].at); }, [msgs]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    const now = new Date().toISOString();
    // Written directly (not via put()) so the Change Log isn't flooded —
    // chat is its own record of who said what.
    await db.chat.put({
      kind: 'chatmsg', id: crypto.randomUUID(), text: body,
      author: meName, emoji: meEmoji, at: now, deviceId: myId,
      updatedAt: now, updatedBy: device,
    } as ChatMessage);
    window.dispatchEvent(new Event('trip-data-changed'));
    if (configured) void syncNow(); // deliver right away
  }

  let lastDay = '';
  return (
    <div className="animate-fadeUp">
      <TabHeader title="Family chat" subtitle={configured ? (pulling ? 'Checking for new messages…' : 'Everyone on the trip sees this') : 'Local only until sharing is set up'}
        gradient="linear-gradient(135deg,#7c3aed,#c084fc)" icon="💬" />

      <div className="px-4 pt-4 space-y-1" style={{ paddingBottom: 'calc(190px + env(safe-area-inset-bottom, 0px))' }}>
        {!configured && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
            To chat with the family, share the trip first (Settings → Share this trip). Messages you send now stay on this phone until then.
          </div>
        )}

        {msgs.length === 0 && (
          <div className="flex flex-col items-center text-center py-14 px-8">
            <span className="text-5xl mb-3">💬</span>
            <p className="font-semibold text-slate-700">Say hi!</p>
            <p className="text-slate-400 text-sm mt-1">Messages here go to everyone who joined the trip.</p>
          </div>
        )}

        {msgs.map(m => {
          const mine = m.deviceId ? m.deviceId === myId : m.updatedBy === device;
          const day = dayOf(m.at);
          const sep = day !== lastDay; lastDay = day;
          return (
            <div key={m.id}>
              {sep && (
                <p className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-wide py-2">{dayLabel(day)}</p>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1.5`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${
                  mine ? 'accent-gradient text-white rounded-br-md' : 'bg-white text-slate-800 rounded-bl-md'
                }`}>
                  {!mine && <p className="text-[11px] font-bold text-accent mb-0.5">{m.emoji} {m.author}</p>}
                  <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">{m.text}</p>
                  <p className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'text-slate-400'}`}>{timeOf(m.at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer — floats above the bottom nav, lifts above the keyboard. */}
      <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-md px-3 z-40"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px + var(--kb, 0px))' }}>
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-2">
          {travelers.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 pb-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">You are</span>
              {travelers.map(t => (
                <button key={t.id} onClick={() => pickMe(t.name)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 border transition ${
                    meName === t.name ? 'bg-accent/10 border-accent text-accent' : 'border-slate-200 text-slate-500'
                  }`}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Message the family…"
              className="flex-1 resize-none bg-slate-50 rounded-2xl px-3.5 py-2.5 text-[15px] text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-accent/20 max-h-28" />
            <button onClick={send} disabled={!text.trim()} aria-label="Send message"
              className="w-11 h-11 rounded-full accent-gradient text-white flex items-center justify-center active:scale-90 disabled:opacity-40 transition flex-shrink-0">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Manual refresh, tucked into the header row. */}
      {configured && (
        <button onClick={() => { setPulling(true); syncNow().finally(() => setPulling(false)); }}
          aria-label="Refresh messages"
          className="fixed right-4 z-40 w-10 h-10 rounded-full bg-white/90 shadow border border-slate-200 flex items-center justify-center"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 190px + var(--kb, 0px))' }}>
          <RefreshCw size={16} className={pulling ? 'animate-spin text-accent' : 'text-slate-400'} />
        </button>
      )}
    </div>
  );
}
