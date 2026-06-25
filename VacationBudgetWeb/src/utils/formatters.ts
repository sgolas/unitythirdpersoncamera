import { Currency, CURRENCY_SYMBOLS, ItineraryEvent } from '../types';

export function formatCurrency(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h === 0 || h === 12 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildGCalUrl(event: ItineraryEvent): string {
  const pad = (s: string) => s.replace(':', '');
  const dateNoDash = event.date.replace(/-/g, '');
  const start = `${dateNoDash}T${pad(event.startTime)}00`;
  const end   = `${dateNoDash}T${pad(event.endTime)}00`;
  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     event.title,
    dates:    `${start}/${end}`,
    details:  event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function gCalDayUrl(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `https://calendar.google.com/calendar/r/day/${y}/${parseInt(m)}/${parseInt(d)}`;
}

export function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const n = new Date(monday);
    n.setDate(monday.getDate() + i);
    return n.toISOString().slice(0, 10);
  });
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
