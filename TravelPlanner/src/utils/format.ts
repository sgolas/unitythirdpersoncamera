/** Date / time formatting helpers. */

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    opts ?? { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtDateLong(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function fmtStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days between today and a date (negative = past). */
export function daysUntil(iso: string): number {
  if (!iso) return 0;
  const target = new Date(iso + 'T00:00:00').getTime();
  const now = new Date(todayStr() + 'T00:00:00').getTime();
  return Math.round((target - now) / 86_400_000);
}

/** Inclusive number of nights/days between two dates. */
export function tripLength(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start + 'T00:00:00').getTime();
  const b = new Date(end + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** List of YYYY-MM-DD dates from start to end inclusive. */
export function dateRange(start: string, end: string): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
