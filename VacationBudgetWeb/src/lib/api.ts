import { Capacitor } from '@capacitor/core';

// When running as a native Android app, Netlify functions must be called
// with an absolute URL since there's no local server to proxy them.
const NATIVE_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://budget.sgolas.com';

export function apiUrl(path: string): string {
  return Capacitor.isNativePlatform() ? `${NATIVE_BASE}${path}` : path;
}

export const isNative = Capacitor.isNativePlatform();
