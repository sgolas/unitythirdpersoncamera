/**
 * Unread-chat tracking + incoming-message notifications.
 *
 * A message counts as "unread" when it came from someone else (not this
 * install) and arrived after the last time this phone had the Chat tab open.
 * We surface that two ways:
 *   • a red dot with a count on the Chat nav tab + an exclamation banner on
 *     the dashboard (reactive, via useUnreadChat)
 *   • a local notification popped when sync pulls in a new message while the
 *     Chat tab isn't already open (notifyIncomingChat, called from applyRemote)
 *
 * There's no push server: notifications fire when the app next syncs (the
 * Chat tab auto-pulls every 25s while open, and any manual/interval sync
 * elsewhere also delivers them).
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getDeviceName } from '../db/database';
import type { ChatMessage } from '../types';
import { notifyMessage } from './notify';

const DEVICE_ID_KEY = 'chat.deviceId';
const LAST_SEEN_KEY = 'chat.lastSeen';   // newest `at` the user has actually viewed
const NOTIFIED_KEY = 'chat.notifiedAt';  // newest `at` we've already popped a notification for
const SEEN_EVENT = 'chat-seen-changed';

/** Random per-install id — device *names* collide (every phone is "Android
 *  phone"), so we tag each message with a stable random id for own-detection. */
export function chatDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

/** True when a message was written by another device (not this install). */
export function isOthersMessage(m: ChatMessage): boolean {
  return m.deviceId ? m.deviceId !== chatDeviceId() : m.updatedBy !== getDeviceName();
}

function getLastSeen(): string { return localStorage.getItem(LAST_SEEN_KEY) || ''; }

/**
 * On a brand-new install, mark all messages that already exist as seen/notified
 * so joining a trip with history doesn't blast a "N new messages" notification
 * or light up the unread badge for old chat. Existing installs (keys already
 * set) are left untouched. Call once at startup.
 */
export function initChatWatermarks() {
  const now = new Date().toISOString();
  if (localStorage.getItem(NOTIFIED_KEY) === null) localStorage.setItem(NOTIFIED_KEY, now);
  if (localStorage.getItem(LAST_SEEN_KEY) === null) localStorage.setItem(LAST_SEEN_KEY, now);
}

// Whether FCM push is active on this device (set by lib/push after a successful
// registration). When it is, the server already delivers a system notification
// for incoming chat, so we must NOT also pop a local one (that's a duplicate).
let pushActive = false;
export function setPushActive(on: boolean) { pushActive = on; }

/** Mark everything up to `latestAt` as read. Called while the Chat tab is open. */
export function markChatSeen(latestAt: string) {
  if (!latestAt) return;
  const prev = getLastSeen();
  if (latestAt > prev) {
    localStorage.setItem(LAST_SEEN_KEY, latestAt);
    // Opening the chat also clears any pending notification watermark.
    if (latestAt > (localStorage.getItem(NOTIFIED_KEY) || '')) localStorage.setItem(NOTIFIED_KEY, latestAt);
    window.dispatchEvent(new Event(SEEN_EVENT));
  }
}

// Whether the Chat tab is currently on screen — set by ChatTab's mount effect.
// When it's open we skip the popup (the message is already visible) but still
// advance the seen watermark.
let chatOpen = false;
export function setChatOpen(open: boolean) { chatOpen = open; }

/**
 * Handle a batch of freshly-synced messages: pop a notification for any that
 * came from others and are newer than the last one we notified about. Skips
 * the popup while the Chat tab is open, but always advances watermarks.
 */
export function notifyIncomingChat(incoming: ChatMessage[]) {
  if (!incoming.length) return;
  const notifiedAt = localStorage.getItem(NOTIFIED_KEY) || '';
  const fresh = incoming
    .filter(m => isOthersMessage(m) && m.at > notifiedAt)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!fresh.length) return;

  const newest = fresh[fresh.length - 1].at;
  localStorage.setItem(NOTIFIED_KEY, newest);
  window.dispatchEvent(new Event(SEEN_EVENT)); // refresh the badge count

  if (chatOpen) { markChatSeen(newest); return; } // already looking at it
  // If FCM push is active the server already showed a system notification for
  // this message — keep the unread badge, but don't pop a duplicate local one.
  if (pushActive) return;

  if (fresh.length === 1) {
    const m = fresh[0];
    void notifyMessage(`${m.emoji || '💬'} ${m.author}`, m.text.slice(0, 140));
  } else {
    void notifyMessage('💬 New messages', `${fresh.length} new messages in the family chat.`);
  }
}

/** Reactive count of unread messages from others (for badges/banners). Queries
 *  only messages newer than the seen watermark (indexed) rather than scanning
 *  the whole chat table on every change. */
export function useUnreadChat(): number {
  const [seen, setSeen] = useState(getLastSeen);
  useEffect(() => {
    const on = () => setSeen(getLastSeen());
    window.addEventListener(SEEN_EVENT, on);
    return () => window.removeEventListener(SEEN_EVENT, on);
  }, []);
  const msgs = useLiveQuery(
    () => db.chat.where('at').above(seen).toArray(),
    [seen],
  ) as ChatMessage[] | undefined;
  if (!msgs) return 0;
  return msgs.filter(m => !m.deleted && isOthersMessage(m)).length;
}
