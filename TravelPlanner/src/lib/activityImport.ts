/**
 * Import an activity/experience from a booking or receipt PDF — fully on-device.
 *
 * Same approach as the stay importer (shared pdfjs text extraction + helpers),
 * tuned for tours, tickets, experiences and restaurant reservations from the
 * usual providers (GetYourGuide, Viator, Tiqets, Klook, Airbnb Experiences,
 * OpenTable, Resy, Ticketmaster, Eventbrite …). Best-effort with a generic
 * fallback; the result is always shown for review before saving.
 */
import { extractPdfText, allDates, grandTotal, findAddress } from './stayImport';

export { extractPdfText };

export interface ParsedActivity {
  title: string;
  provider: string;
  date: string;         // ISO yyyy-mm-dd (or '')
  startTime: string;    // 'HH:MM' (or '')
  endTime: string;      // 'HH:MM' (or '')
  location: string;
  confirmation: string;
  cost: number;
  costCurrency: string;
  notes: string;
  found: string[];
}

const PROVIDERS: [RegExp, string][] = [
  [/getyourguide/i, 'GetYourGuide'], [/viator/i, 'Viator'], [/tiqets/i, 'Tiqets'],
  [/klook/i, 'Klook'], [/airbnb/i, 'Airbnb'], [/opentable/i, 'OpenTable'],
  [/\bresy\b/i, 'Resy'], [/ticketmaster/i, 'Ticketmaster'], [/eventbrite/i, 'Eventbrite'],
  [/\bfever\b/i, 'Fever'], [/headout/i, 'Headout'], [/musement/i, 'Musement'],
  [/civitatis/i, 'Civitatis'], [/tripadvisor|viatortrip/i, 'Tripadvisor'],
  [/booking\.com/i, 'Booking.com'], [/get your guide/i, 'GetYourGuide'],
];

/** Convert a "10:00", "2:30 PM", "14:00" style time to 24h "HH:MM" or ''. */
function toTime(h: number, min: string, ap: string): string {
  ap = ap.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h >= 0 && h <= 23 ? `${String(h).padStart(2, '0')}:${min}` : '';
}
/** First plausible clock time in a chunk of text (skips payment timestamps). */
function findTime(text: string): string {
  const re = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?|)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (/\b(?:EST|EDT|PST|PDT|UTC|GMT|processed|charged|paid|receipt)\b/i.test(text.slice(Math.max(0, m.index - 4), m.index + 24))) continue;
    const t = toTime(+m[1], m[2], m[3] || '');
    if (t) return t;
  }
  return '';
}
/** Text on the label line + the two after it (for "Time: …" style values). */
function after(lines: string[], re: RegExp): string {
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return `${lines[i]} ${lines[i + 1] ?? ''} ${lines[i + 2] ?? ''}`;
  }
  return '';
}

export function parseActivity(text: string): ParsedActivity {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const flat = lines.join('\n');
  const year = new Date().getFullYear();
  const found: string[] = [];

  const provider = PROVIDERS.find(([re]) => re.test(flat))?.[1] ?? '';
  if (provider) found.push('provider');

  // Date — prefer one near a date/when label, else the first date in the file
  // (activities are usually a single day).
  let date = allDates(after(lines, /\b(?:date|when|activity date|travel date|day)\b/i), year)[0] || '';
  if (!date) date = allDates(flat, year)[0] || '';
  if (date) found.push('date');

  // Times — prefer a labelled start time; a range fills end time too.
  const timeWin = after(lines, /\b(?:time|start|starts|begins|when|entry|departure|check[\s-]?in|arriv)\b/i);
  const startTime = findTime(timeWin) || findTime(flat);
  let endTime = '';
  const range = timeWin.match(/(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[–\-—to]+\s*(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (range) endTime = findTime(range[2]);
  if (startTime) found.push('time');

  // Confirmation / booking reference / order number.
  let confirmation = '';
  let m = flat.match(/(?:confirmation|booking|reservation|order|reference|ticket)\s*(?:code|number|reference|ref|id|no\.?|#)?\s*[:#]?\s*\n?\s*([A-Z0-9][A-Z0-9-]{4,15})\b/i)
    || flat.match(/\b([A-Z]{2,4}-?\d{5,10})\b/);
  if (m) { confirmation = m[1].toUpperCase(); found.push('confirmation'); }

  // Location — reuse the stay address finder (labels, street words, postal code).
  const location = findAddress(lines);
  if (location) found.push('location');

  // Title. Restaurant reservations → "reservation at <name>"; otherwise a line
  // with an activity keyword; otherwise the first prominent non-boilerplate line.
  let title = '';
  m = flat.match(/reservation (?:at|for)\s+([^\n,]{2,60})/i) || flat.match(/table for\s+\d+\b.*?\bat\s+([^\n,]{2,60})/i);
  if (m) title = m[1].trim();
  const KW = /\b(tour|tickets?|experience|admission|entry|entrance|pass|cruise|class|workshop|tasting|show|concert|museum|gallery|guided|skip[- ]the[- ]line|day trip|excursion|safari|dinner|lunch|brunch|walking|visit|activity)\b/i;
  const BOILER = /confirm|receipt|booking (?:reference|number)|order|thank|hello|^hi\b|dear |your (?:booking|order|reservation|trip)|policy|refund|support|invoice|^total|^\d/i;
  if (!title) {
    const line = lines.find(l => KW.test(l) && l.length >= 6 && l.length <= 80 && !BOILER.test(l));
    if (line) title = line.replace(/\s+/g, ' ').trim();
  }
  if (!title) {
    title = lines.slice(0, 10).find(l => l.length >= 6 && l.length <= 80 && !BOILER.test(l) && allDates(l, year).length === 0 && !findTime(l)) || '';
  }
  if (!title && provider) title = `${provider} activity`;
  if (title) found.push('title');

  const { cost, cur: costCurrency } = grandTotal(lines);
  if (cost > 0) { found.push('cost'); if (costCurrency) found.push('currency'); }

  const notes = provider ? `Imported from ${provider} booking PDF` : 'Imported from booking PDF';
  return { title, provider, date, startTime, endTime, location, confirmation, cost, costCurrency, notes, found };
}
