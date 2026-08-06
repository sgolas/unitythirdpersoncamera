/**
 * Theme engine — light / dark / system mode + dynamic accent themes.
 * Applies a `.dark` class and `data-accent` attribute to <html>, persists the
 * choice, and follows the OS setting when in "system" mode.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'ocean' | 'sunset' | 'grape' | 'forest' | 'royal';

export const ACCENTS: { key: Accent; label: string; from: string; to: string }[] = [
  { key: 'ocean',  label: 'Ocean',  from: '#0ea5e9', to: '#22d3ee' },
  { key: 'sunset', label: 'Sunset', from: '#fb7185', to: '#f59e0b' },
  { key: 'grape',  label: 'Grape',  from: '#a78bfa', to: '#ec4899' },
  { key: 'forest', label: 'Forest', from: '#34d399', to: '#10b981' },
  { key: 'royal',  label: 'Royal',  from: '#6366f1', to: '#8b5cf6' },
];

const MODE_KEY = 'theme.mode';
const ACCENT_KEY = 'theme.accent';

export function getMode(): ThemeMode { return (localStorage.getItem(MODE_KEY) as ThemeMode) || 'system'; }
export function getAccent(): Accent { return (localStorage.getItem(ACCENT_KEY) as Accent) || 'ocean'; }

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Whether dark styling is currently active. */
export function isDark(): boolean {
  const m = getMode();
  return m === 'dark' || (m === 'system' && systemPrefersDark());
}

export function applyTheme() {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark());
  root.setAttribute('data-accent', getAccent());
}

export function setMode(mode: ThemeMode) { localStorage.setItem(MODE_KEY, mode); applyTheme(); }
export function setAccent(accent: Accent) { localStorage.setItem(ACCENT_KEY, accent); applyTheme(); }

/** Call once at startup; keeps in sync with the OS in system mode. */
export function initTheme() {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => { if (getMode() === 'system') applyTheme(); });
}
