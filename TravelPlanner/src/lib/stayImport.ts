/**
 * Import a stay from a booking-confirmation PDF — fully on-device.
 *
 * We reuse the bundled pdfjs-dist to pull the text out of the PDF (nothing is
 * uploaded anywhere), then best-effort parse the fields of a stay. Tuned for
 * Airbnb's confirmation layout with a generic fallback that also catches most
 * Booking.com / VRBO / hotel confirmations. The result is always shown to the
 * user to review and correct before saving — the parser is a head start, not a
 * source of truth.
 */

export interface ParsedStay {
  name: string;
  city: string;
  address: string;
  checkIn: string;    // ISO yyyy-mm-dd (or '')
  checkOut: string;   // ISO yyyy-mm-dd (or '')
  confirmation: string;
  cost: number;       // 0 if not found
  costCurrency: string;
  notes: string;
  provider: 'airbnb' | 'booking' | 'vrbo' | 'generic';
  /** Which fields we actually found (for the review UI to hint at gaps). */
  found: string[];
}

/* ── PDF → text (line-reconstructed) ────────────────────────── */
export async function extractPdfText(file: File | Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    // Group text items into visual lines by their y-position, so keywords and
    // their values stay on the same line (much better for parsing).
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string' || !item.str) continue;
      const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
      const x = item.transform?.[4] ?? 0;
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x, s: item.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const row = rows.get(y)!.sort((a, b) => a.x - b.x).map(r => r.s).join(' ');
      if (row.trim()) lines.push(row.replace(/\s+/g, ' ').trim());
    }
  }
  return lines.join('\n');
}

/* ── Date parsing (many formats → ISO) ──────────────────────── */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** All parseable dates in a chunk of text, in order, as ISO strings. Handles
 *  "Sep 8, 2025", "8 September", "Mon, Oct 6", "2025-09-08" and "09/08/2025". */
export function allDates(text: string, year: number): string[] {
  const out: string[] = [];
  const re = /(20\d{2})-(\d{1,2})-(\d{1,2})|([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?|(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s*(20\d{2}))?|(\d{1,2})\/(\d{1,2})\/(20\d{2})/g;
  let m: RegExpExecArray | null;
  const mon = (s: string) => MONTHS[s.slice(0, 3).toLowerCase()];
  while ((m = re.exec(text))) {
    if (m[1]) out.push(iso(+m[1], +m[2], +m[3]));
    else if (m[4] && mon(m[4])) out.push(iso(m[6] ? +m[6] : year, mon(m[4]), +m[5]));
    else if (m[8] && mon(m[8])) out.push(iso(m[9] ? +m[9] : year, mon(m[8]), +m[7]));
    else if (m[10]) out.push(iso(+m[12], +m[10], +m[11]));
  }
  return out;
}

/** First parseable date inside a chunk of text; returns ISO or ''. */
function findDate(text: string, fallbackYear: number): string {
  return allDates(text, fallbackYear)[0] || '';
}

/** Grab the text window right after the first keyword hit (same line + next). */
function windowAfter(lines: string[], re: RegExp): string {
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return `${lines[i]} ${lines[i + 1] ?? ''} ${lines[i + 2] ?? ''}`;
  }
  return '';
}

const CUR: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

/** Last array element matching a predicate (avoids relying on Array.findLast). */
function findLast<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i];
  return undefined;
}

/**
 * The grand-total amount + currency from a receipt's lines. Reads only the
 * grand-total line so discounts are already applied: prefers an explicit
 * "Total (CAD) $1,234.00" (currency from the code, not the ambiguous $ symbol),
 * else a plain "Total" line — never "Subtotal" or item lines.
 */
export function grandTotal(lines: string[]): { cost: number; cur: string } {
  let parenCur = '';
  let totalLine = findLast(lines, l => /\btotal\s*\(([a-z]{3})\)/i.test(l) && !/sub-?total/i.test(l));
  if (totalLine) parenCur = (totalLine.match(/\btotal\s*\(([a-z]{3})\)/i)![1]).toUpperCase();
  if (!totalLine) totalLine = findLast(lines, l => /\b(?:grand\s+)?total\b/i.test(l) && !/sub-?total/i.test(l));
  if (!totalLine) return { cost: 0, cur: '' };
  let mv = lastMoney(totalLine);
  if (!mv) { const i = lines.indexOf(totalLine); mv = i >= 0 && lines[i + 1] ? lastMoney(lines[i + 1]) : null; }
  return mv && mv.num > 0 ? { cost: mv.num, cur: parenCur || mv.cur } : { cost: 0, cur: '' };
}

/** The last monetary value on a line, e.g. "Total (CAD)  $1,234.00" → 1234. */
export function lastMoney(line: string): { num: number; cur: string } | null {
  const re = /([$€£¥])\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(USD|EUR|GBP|CAD|AUD|JPY|CHF|NZD)\b/gi;
  let m: RegExpExecArray | null, last: RegExpExecArray | null = null;
  while ((m = re.exec(line))) last = m;
  if (!last) return null;
  return last[1]
    ? { num: parseNumber(last[2]), cur: CUR[last[1]] || '' }
    : { num: parseNumber(last[3]), cur: (last[4] || '').toUpperCase() };
}

/* ── The parser ─────────────────────────────────────────────── */
export function parseStay(text: string): ParsedStay {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const flat = lines.join('\n');
  const year = new Date().getFullYear();
  const found: string[] = [];

  const provider: ParsedStay['provider'] =
    /airbnb/i.test(flat) ? 'airbnb'
      : /booking\.com/i.test(flat) ? 'booking'
        : /vrbo|homeaway/i.test(flat) ? 'vrbo' : 'generic';

  // Dates. Airbnb often prints check-in and checkout as two columns —
  // "CHECK-IN   CHECKOUT" on one line, the two dates on the next — so when both
  // labels share a line we take the first two dates that follow; otherwise we
  // read each label's own region.
  const inRe = /check[\s-]?in|arriv/i;
  const outRe = /check[\s-]?out|depart/i;
  const ciIdx = lines.findIndex(l => inRe.test(l));
  const coIdx = lines.findIndex(l => outRe.test(l));
  let checkIn = '', checkOut = '';
  if (ciIdx >= 0 && ciIdx === coIdx) {
    // Combined header — dates are on the following line(s), first = in, second = out.
    const ds = allDates(`${lines[ciIdx + 1] ?? ''} ${lines[ciIdx + 2] ?? ''} ${lines[ciIdx + 3] ?? ''}`, year);
    checkIn = ds[0] || ''; checkOut = ds[1] || '';
  } else {
    checkIn = findDate(windowAfter(lines, inRe), year);
    checkOut = findDate(windowAfter(lines, outRe), year);
  }
  // Fallback: a "Sep 5 – Sep 8" / "Oct 6 – 9" style range anywhere.
  if (!checkIn || !checkOut) {
    const range = flat.match(/([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*20\d{2})?)\s*[–\-—]+\s*([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*20\d{2})?|\d{1,2}(?:,?\s*20\d{2})?)/);
    if (range) {
      checkIn = checkIn || findDate(range[1], year);
      // second half may omit the month ("Sep 5 – 8") — borrow the first month.
      checkOut = checkOut || findDate(/[A-Za-z]/.test(range[2]) ? range[2] : `${range[1].split(/\d/)[0]} ${range[2]}`, year);
    }
  }
  // Last resort: if we have a check-in but no checkout, take the next distinct
  // date that comes after it anywhere in the document.
  if (checkIn && !checkOut) {
    const later = allDates(flat, year).filter(d => d > checkIn).sort();
    if (later[0]) checkOut = later[0];
  }
  if (checkIn) found.push('check-in');
  if (checkOut) found.push('check-out');

  // Confirmation code — Airbnb codes are usually HM******** but accept generic.
  let confirmation = '';
  let m = flat.match(/confirmation\s*code[:\s]*\n?\s*([A-Z0-9]{5,14})/i)
    || flat.match(/\b(HM[A-Z0-9]{6,10})\b/)
    || flat.match(/(?:booking|reservation|itinerary)\s*(?:number|code|id|no\.?)[:\s]*\n?\s*([A-Z0-9-]{5,16})/i);
  if (m) { confirmation = m[1].toUpperCase(); found.push('confirmation'); }

  // Address — see findAddress() (label, street word, or postal-code line).
  const address = findAddress(lines);
  if (address) found.push('address');

  // City. Try, in order: an Airbnb greeting ("You're all set for Ostrołęka" /
  // "Your trip to Lisbon"), a "… in City, Country" title, then derive it from
  // the address (the part before the country, minus any postal code).
  let city = '';
  m = flat.match(/(?:all set for|trip to|going to|heading to|welcome to|your stay in)\s+(\p{Lu}[\p{L}][\p{L} .'’-]*?)\s*[!.\n]/u)
    || flat.match(/\b(?:in|·)\s+(\p{Lu}[\p{L} .'’-]+),\s*\p{Lu}[\p{L} .'’-]{2,}/u);
  if (m) city = m[1].trim();
  if (!city && address) city = cityFromAddress(address);
  if (city) found.push('city');

  // Listing / property name. Airbnb prints the listing title on its own line,
  // just above "Entire home/apt hosted by …" — prefer that real title.
  let name = '';
  const hostIdx = lines.findIndex(l => /hosted by/i.test(l));
  if (hostIdx > 0 && !/^(?:you'?re all set|your trip|welcome)/i.test(lines[hostIdx - 1]) && lines[hostIdx - 1].length <= 80) {
    name = lines[hostIdx - 1].trim();
  }
  if (!name) {
    const titleLine = lines.find(l => /entire\s+(?:home|rental unit|place|apartment|condo|villa|house|cabin|loft|guest suite)|room in|hosted by/i.test(l));
    if (titleLine) name = titleLine.replace(/\s+/g, ' ').trim();
  }
  if (!name && provider === 'airbnb') name = city ? `Airbnb in ${city}` : 'Airbnb stay';
  if (!name && city) name = `Stay in ${city}`;
  if (name) found.push('name');

  // Total cost + currency (grand-total line only — see grandTotal()).
  const { cost, cur: costCurrency } = grandTotal(lines);
  if (cost > 0) { found.push('cost'); if (costCurrency) found.push('currency'); }

  const notes = provider === 'airbnb' ? 'Imported from Airbnb confirmation PDF'
    : provider === 'generic' ? 'Imported from confirmation PDF'
      : `Imported from ${provider} confirmation PDF`;

  return { name, city, address, checkIn, checkOut, confirmation, cost, costCurrency, notes, provider, found };
}

/**
 * Find a postal/street address in a receipt's lines. Best signal is an explicit
 * label ("Address" / "Location" / "Venue" / "Meeting point" …) with the value on
 * the next line; otherwise a line carrying a street-type word (many languages)
 * or a recognisable postal code (US / EU / PT / PL / UK / CA).
 */
export function findAddress(lines: string[]): string {
  const STREET = /\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|square|sq|terrace|crescent|close|parade|rua|avenida|travessa|largo|pra(?:ç|c)a|calle|carrer|carrera|avda|paseo|plaza|ronda|camino|rue|quai|impasse|chemin|all[ée]e|via|viale|piazza|corso|strada|contrada|stra(?:ss|ß)e|platz|weg|gasse|allee|ring|damm|ufer|straat|gracht|plein|kade|gata|gate|vei|vej|plads|katu|sokak|cadde|ulica|ul\.)\b/i;
  const KEYWORD = /check|total|subtotal|confirm|night|fee|guest|reservation|hosted|directions|www\.|http|@/i;
  const POSTAL = /\b(?:\d{5}(?:-\d{4})?|\d{4}\s?[A-Z]{2}|\d{4}-\d{3}|\d{2}-\d{3}|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|[A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/;
  const labelIdx = lines.findIndex(l => /^\s*(?:address|location|venue|meeting point|where(?: you'?ll be(?: staying)?)?|getting there)\s*:?\s*$/i.test(l));
  if (labelIdx >= 0) {
    for (let j = labelIdx + 1; j < Math.min(labelIdx + 3, lines.length); j++) {
      if (lines[j] && !/^get directions/i.test(lines[j]) && !/^-{3,}/.test(lines[j])) return lines[j].trim();
    }
  }
  let addrLine = lines.find(l => l.length <= 90 && /\d/.test(l) && STREET.test(l) && !KEYWORD.test(l));
  if (!addrLine) addrLine = lines.find(l => l.length <= 90 && l.includes(',') && POSTAL.test(l) && !KEYWORD.test(l));
  return addrLine ? addrLine.replace(/\s+/g, ' ').trim() : '';
}

/** Pull a city out of a comma-separated address: the segment before the
 *  country, with any leading postal code stripped.
 *  "Bohaterów Warszawy, 07-410 Ostrołęka, Poland" → "Ostrołęka";
 *  "Lisbon, Portugal" → "Lisbon". */
function cityFromAddress(addr: string): string {
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const seg = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  return seg.replace(/^\s*(?:\d{2}-\d{3}|\d{4}-\d{3}|\d{3,6}|[A-Z]\d[A-Z]\s?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\s+/i, '').trim();
}

/** Parse "1,234.56" and "1.234,56" (EU) into a number. */
export function parseNumber(s: string): number {
  const t = s.replace(/[^\d.,]/g, '');
  // If both separators present, the last one is the decimal separator.
  if (t.includes('.') && t.includes(',')) {
    return t.lastIndexOf(',') > t.lastIndexOf('.')
      ? parseFloat(t.replace(/\./g, '').replace(',', '.'))
      : parseFloat(t.replace(/,/g, ''));
  }
  if (t.includes(',')) {
    // "1,234" → thousands; "12,50" → decimal
    return /,\d{2}$/.test(t) ? parseFloat(t.replace(',', '.')) : parseFloat(t.replace(/,/g, ''));
  }
  return parseFloat(t) || 0;
}
