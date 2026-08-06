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

  // Provider — a known brand, or "operated by X" / a booking email domain.
  let provider = PROVIDERS.find(([re]) => re.test(flat))?.[1] ?? '';
  if (!provider) {
    const op = flat.match(/operated by\s+([A-Z][\w&'. -]{1,30})/i);
    if (op) provider = op[1].replace(/\s+/g, ' ').trim();
  }
  if (provider) found.push('provider');

  // Date — prefer one near a date/when label, else the first real date in the
  // file (activities are usually a single day).
  let date = allDates(after(lines, /\b(?:date|when|activity date|travel date|day|visit)\b/i), year)[0] || '';
  if (!date) date = allDates(flat, year)[0] || '';
  if (date) found.push('date');

  // Times — only trust a labelled start time, or a time on a short "data" line;
  // never a time buried in a policy/warning sentence (e.g. "bookings at 6:00 PM").
  const timeWin = after(lines, /\b(?:time|start|starts|begins|when|entry|departure|check[\s-]?in|arriv|pick[\s-]?up)\b/i);
  let startTime = findTime(timeWin);
  if (!startTime) {
    const shortTimeLine = lines.find(l => l.length < 42 && /\b\d{1,2}:\d{2}\b/.test(l)
      && !/valid|policy|warning|slot|within|prior|before|after\b|hours?\b|instruction/i.test(l) && findTime(l));
    if (shortTimeLine) startTime = findTime(shortTimeLine);
  }
  let endTime = '';
  const range = timeWin.match(/(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[–\-—to]+\s*(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (range) endTime = findTime(range[2]);
  if (startTime) found.push('time');

  // Confirmation / booking reference. Must contain a digit (so plain words like
  // "INCLUDES" are never mistaken for a code); prefer a "TIE-900647" style ref.
  let confirmation = '';
  let m = flat.match(/\b([A-Z]{2,6}-\d{3,10})\b/)
    || flat.match(/(?:confirmation|booking|reservation|order|reference|voucher|ticket)\s*(?:code|number|reference|ref|id|no\.?|#)?\s*[:#]?\s*\n?\s*([A-Z]{0,4}-?\d[A-Z0-9-]{3,14})\b/i)
    || flat.match(/\b([A-Z]{2,4}\d{5,10})\b/);
  if (m && /\d/.test(m[1])) { confirmation = m[1].toUpperCase(); found.push('confirmation'); }

  // Location — an explicit address (label/street/postal), else a "City, Country"
  // line or a bare city that shows up under a Destinations/Where heading.
  let location = findAddress(lines);
  if (!location) {
    m = flat.match(/\b([A-Z][\p{L}'’.\s-]{2,28}),\s*(?:Italy|France|Spain|Portugal|Germany|Greece|Austria|Netherlands|Belgium|Switzerland|Croatia|USA|United States|UK|United Kingdom|Canada|Mexico|Japan|Thailand)\b/u);
    if (m) location = `${m[1].trim()}, ${m[0].slice(m[1].length + 1).trim()}`;
  }
  if (location) found.push('location');

  // Title. In priority: restaurant "reservation at X"; a "Visit <Attraction>"
  // phrase; an "Activity/Experience: X" label; a keyword line; a prominent
  // early line. Count/boilerplate lines ("1 Experience") are rejected.
  const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[\s:–-]+$/, '').trim();
  const BOILER = /confirm|receipt|booking (?:reference|number)|order|thank|hello|^hi\b|dear |your (?:booking|order|reservation|trip)|policy|refund|support|invoice|documentation|glossary|itinerary|^total|^\d|^\d+\s+(?:destination|experience|adult|child|hour|day|night|participant|point)/i;
  let title = '';
  m = flat.match(/reservation (?:at|for)\s+([^\n,]{2,60})/i)
    || flat.match(/\bvisit(?:\s+to)?\s+([A-Z][^,.\n]{3,48})/)
    || flat.match(/\b(?:activit(?:y|ies)|experiences?|service|attraction|excursion|tour)\s*[:\-–]\s*([^\n]{2,50})/i);
  if (m) title = clean(m[1]);
  const KW = /\b(tour|tickets?|experience|admission|entry|entrance|pass|cruise|class|workshop|tasting|show|concert|museum|gallery|guided|skip[- ]the[- ]line|day trip|excursion|safari|dinner|lunch|brunch|walking|basilica|cathedral|palace|castle|park|garden)\b/i;
  if (!title) {
    const line = lines.find(l => KW.test(l) && l.length >= 5 && l.length <= 70 && !BOILER.test(l));
    if (line) title = clean(line);
  }
  if (!title) {
    title = clean(lines.slice(0, 12).find(l => l.length >= 5 && l.length <= 70 && !BOILER.test(l) && allDates(l, year).length === 0 && !findTime(l)) || '');
  }
  if (!title && provider) title = `${provider} activity`;
  if (title) found.push('title');

  const { cost, cur: costCurrency } = grandTotal(lines);
  if (cost > 0) { found.push('cost'); if (costCurrency) found.push('currency'); }

  const notes = provider ? `Imported from ${provider} booking PDF` : 'Imported from booking PDF';
  return { title, provider, date, startTime, endTime, location, confirmation, cost, costCurrency, notes, found };
}
