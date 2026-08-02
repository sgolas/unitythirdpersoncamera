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

/** Find the first parseable date inside a chunk of text; returns ISO or ''. */
function findDate(text: string, fallbackYear: number): string {
  // 2025-09-08
  let m = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // "Sep 8, 2025" / "September 8 2025" / "Sep 8"
  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    return iso(m[3] ? +m[3] : fallbackYear, MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  }
  // "8 September 2025" / "8 Sep"
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s*(20\d{2}))?/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    return iso(m[3] ? +m[3] : fallbackYear, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  }
  // 09/08/2025 (assume M/D/Y — most confirmation emails are US-format)
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (m) return iso(+m[3], +m[1], +m[2]);
  return '';
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

/** The last monetary value on a line, e.g. "Total (CAD)  $1,234.00" → 1234. */
function lastMoney(line: string): { num: number; cur: string } | null {
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

  // Dates — prefer labelled check-in / check-out.
  let checkIn = findDate(windowAfter(lines, /check[\s-]?in|arrive|arrival/i), year);
  let checkOut = findDate(windowAfter(lines, /check[\s-]?out|depart|departure/i), year);
  // Fallback: a "Sep 5 – Sep 8" style range anywhere.
  if (!checkIn || !checkOut) {
    const range = flat.match(/([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*20\d{2})?)\s*[–\-—to]+\s*([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*20\d{2})?|\d{1,2}(?:,?\s*20\d{2})?)/);
    if (range) {
      checkIn = checkIn || findDate(range[1], year);
      // second half may omit the month ("Sep 5 – 8") — borrow the first month.
      checkOut = checkOut || findDate(/[A-Za-z]/.test(range[2]) ? range[2] : `${range[1].split(/\d/)[0]} ${range[2]}`, year);
    }
  }
  if (checkIn) found.push('check-in');
  if (checkOut) found.push('check-out');

  // Confirmation code — Airbnb codes are usually HM******** but accept generic.
  let confirmation = '';
  let m = flat.match(/confirmation\s*code[:\s]*\n?\s*([A-Z0-9]{5,14})/i)
    || flat.match(/\b(HM[A-Z0-9]{6,10})\b/)
    || flat.match(/(?:booking|reservation|itinerary)\s*(?:number|code|id|no\.?)[:\s]*\n?\s*([A-Z0-9-]{5,16})/i);
  if (m) { confirmation = m[1].toUpperCase(); found.push('confirmation'); }

  // City + country — Airbnb: "Entire rental unit in Lisbon, Portugal".
  let city = '';
  m = flat.match(/\b(?:in|·)\s+([A-Z][A-Za-zÀ-ÿ .'-]+),\s*([A-Z][A-Za-zÀ-ÿ .'-]{2,})/);
  if (m) { city = m[1].trim(); found.push('city'); }

  // Address — a line carrying a street-type word (many languages) and a number.
  // Handles US "12 Baker Street" and EU "Rua Garrett 12, 1200-273 Lisboa".
  let address = '';
  const STREET = /\b(?:street|st|road|rd|ave|avenue|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|square|sq|rua|avenida|calle|carrer|carrera|via|viale|strada|stra(?:ss|ß)e|platz|weg|gasse|plein|gata|dam)\b/i;
  const addrLine = lines.find(l => l.length <= 90 && /\d/.test(l) && STREET.test(l) && !/check|total|confirm|night|fee|guest/i.test(l));
  if (addrLine) { address = addrLine.replace(/\s+/g, ' ').trim(); found.push('address'); }

  // Listing / property name.
  let name = '';
  const titleLine = lines.find(l => /entire\s+(?:home|rental unit|place|apartment|condo|villa|house|cabin|loft|guest suite)|room in|hosted by/i.test(l));
  if (titleLine) name = titleLine.replace(/\s+/g, ' ').trim();
  if (!name && provider === 'airbnb') name = city ? `Airbnb in ${city}` : 'Airbnb stay';
  if (!name && city) name = `Stay in ${city}`;
  if (name) found.push('name');

  // Total cost + currency. Read the *grand-total* line only, so any discounts
  // are already applied. Airbnb prints "Total (CAD)  $1,234.00" — we prefer
  // that line and take the currency from the (CAD) code, not the $ symbol
  // (which is ambiguous). We deliberately skip "Subtotal" and item lines like
  // "$214 x 3 nights" / "Weekly discount -$50" so the pre-discount amount and
  // the discount itself are never picked up.
  let cost = 0; let costCurrency = '';
  // 1) The explicit "Total (CUR)" line (last one wins), with its currency code.
  let parenCur = '';
  let totalLine = findLast(lines, l => /\btotal\s*\(([a-z]{3})\)/i.test(l) && !/sub-?total/i.test(l));
  if (totalLine) parenCur = (totalLine.match(/\btotal\s*\(([a-z]{3})\)/i)![1]).toUpperCase();
  // 2) Otherwise a plain grand-total line — never "Subtotal".
  if (!totalLine) {
    totalLine = findLast(lines, l => /\b(?:grand\s+)?total\b/i.test(l) && !/sub-?total/i.test(l));
  }
  if (totalLine) {
    // Amount is normally on the total line; occasionally on the next line.
    let mv = lastMoney(totalLine);
    if (!mv) { const i = lines.indexOf(totalLine); mv = i >= 0 && lines[i + 1] ? lastMoney(lines[i + 1]) : null; }
    if (mv && mv.num > 0) { cost = mv.num; costCurrency = parenCur || mv.cur; }
  }
  if (cost > 0) { found.push('cost'); if (costCurrency) found.push('currency'); }

  const notes = provider === 'airbnb' ? 'Imported from Airbnb confirmation PDF'
    : provider === 'generic' ? 'Imported from confirmation PDF'
      : `Imported from ${provider} confirmation PDF`;

  return { name, city, address, checkIn, checkOut, confirmation, cost, costCurrency, notes, provider, found };
}

/** Parse "1,234.56" and "1.234,56" (EU) into a number. */
function parseNumber(s: string): number {
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
