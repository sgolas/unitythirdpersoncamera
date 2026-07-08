/**
 * User-pinned dashboard shortcuts. A per-device list of section keys the user
 * has added to their Home screen by long-pressing an item in the More menu.
 * Stored locally (like widget collapse state) and broadcast so the dashboard
 * and More menu update live.
 */
import { useEffect, useState } from 'react';

const KEY = 'dash.shortcuts';
const EVT = 'dash-shortcuts-changed';

export function getShortcuts(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

function save(list: string[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVT));
}

export function isPinned(key: string): boolean { return getShortcuts().includes(key); }

export function pinShortcut(key: string) {
  const list = getShortcuts();
  if (!list.includes(key)) save([...list, key]);
}

export function unpinShortcut(key: string) {
  save(getShortcuts().filter(k => k !== key));
}

export function toggleShortcut(key: string) {
  isPinned(key) ? unpinShortcut(key) : pinShortcut(key);
}

/** Reactive list of pinned shortcut keys. */
export function useShortcuts(): string[] {
  const [list, setList] = useState<string[]>(getShortcuts);
  useEffect(() => {
    const on = () => setList(getShortcuts());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return list;
}
