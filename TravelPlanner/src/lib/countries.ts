/**
 * Country list + "where is it" lookup for the map's country picker.
 * Names come from the built-in Intl database (no data file needed) and the
 * flag emoji is derived from the ISO code. A country's map bounds are
 * geocoded once via the free Nominatim service and cached locally.
 */

const CODES = ('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GL GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW').split(' ');

export interface Country { code: string; name: string; flag: string }

const displayName = new Intl.DisplayNames(['en'], { type: 'region' });

export const COUNTRIES: Country[] = CODES
  .map(code => ({
    code,
    name: displayName.of(code) ?? code,
    flag: String.fromCodePoint(...[...code].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export type Bounds = [[number, number], [number, number]]; // [[south,west],[north,east]]

/** Map bounds for a country (geocoded once, cached in localStorage). */
export async function countryBounds(name: string): Promise<Bounds | null> {
  const key = 'cbounds:' + name.toLowerCase();
  const cached = localStorage.getItem(key);
  if (cached) { try { return JSON.parse(cached) as Bounds; } catch { /* refetch */ } }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(name)}`,
      { headers: { Accept: 'application/json' }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    const d = await r.json() as { boundingbox?: [string, string, string, string] }[];
    const bb = d?.[0]?.boundingbox;
    if (bb) {
      const bounds: Bounds = [[parseFloat(bb[0]), parseFloat(bb[2])], [parseFloat(bb[1]), parseFloat(bb[3])]];
      localStorage.setItem(key, JSON.stringify(bounds));
      return bounds;
    }
  } catch { /* offline */ }
  return null;
}
