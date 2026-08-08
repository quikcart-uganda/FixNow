/**
 * Public job reference helpers.
 * Internal Mongo ObjectIds remain the system of record.
 * Format: <CAT>-<DIST>-<DDMMYY>-<HHMM>-<SEQ>
 * Example: PST-KLA-260726-0935-001
 */

const CATEGORY_CODES: Record<string, string> = {
  'pest control': 'PST',
  pest: 'PST',
  plumbing: 'PLB',
  plumber: 'PLB',
  electrical: 'ELC',
  electrician: 'ELC',
  carpentry: 'CAR',
  carpenter: 'CAR',
  cleaning: 'CLN',
  painting: 'PNT',
  paint: 'PNT',
  hvac: 'HVC',
  roofing: 'ROF',
  locksmith: 'LCK',
  solar: 'SOL',
  cctv: 'CCT',
  appliance: 'APP',
  gardening: 'GRD',
  landscaping: 'GRD',
  masonry: 'MSN',
  construction: 'CON',
  moving: 'MOV',
  general: 'GEN',
  'general repair': 'GEN',
  'auto repair': 'AUT',
  it: 'ITC',
  electronics: 'ELC',
}

const DISTRICT_CODES: Record<string, string> = {
  kampala: 'KLA',
  wakiso: 'WKS',
  mukono: 'MKN',
  entebbe: 'ENT',
  jinja: 'JJA',
  mbarara: 'MBR',
  gulu: 'GLU',
  mbale: 'MBL',
  arua: 'ARU',
  fortportal: 'FPT',
  'fort portal': 'FPT',
  lira: 'LRA',
  masaka: 'MSK',
  soroti: 'SRT',
  hoima: 'HMA',
  kabale: 'KBL',
}

function pad(n: number, width: number) {
  return String(n).padStart(width, '0')
}

export function categoryCode(name?: string | null): string {
  const key = String(name || '')
    .trim()
    .toLowerCase()
  if (!key) return 'GEN'
  if (CATEGORY_CODES[key]) return CATEGORY_CODES[key]
  for (const [k, code] of Object.entries(CATEGORY_CODES)) {
    if (key.includes(k) || k.includes(key)) return code
  }
  const letters = key.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase()
  return letters.padEnd(3, 'X')
}

export function districtCode(name?: string | null): string {
  const key = String(name || '')
    .trim()
    .toLowerCase()
  if (!key) return 'UGX'
  if (DISTRICT_CODES[key]) return DISTRICT_CODES[key]
  const compact = key.replace(/[^a-z]/g, '')
  if (DISTRICT_CODES[compact]) return DISTRICT_CODES[compact]
  return compact.slice(0, 3).toUpperCase().padEnd(3, 'X')
}

export function formatJobReferenceParts(input: {
  categoryName?: string | null
  district?: string | null
  at?: Date
  sequence: number
}): string {
  const at = input.at ?? new Date()
  const dd = pad(at.getDate(), 2)
  const mm = pad(at.getMonth() + 1, 2)
  const yy = pad(at.getFullYear() % 100, 2)
  const hh = pad(at.getHours(), 2)
  const mi = pad(at.getMinutes(), 2)
  const seq = pad(Math.max(1, input.sequence), 3)
  return `${categoryCode(input.categoryName)}-${districtCode(input.district)}-${dd}${mm}${yy}-${hh}${mi}-${seq}`
}

/** True when the query looks like a public job reference. */
export function looksLikeJobReference(q: string): boolean {
  return /^[A-Z]{2,4}-[A-Z0-9]{2,4}-\d{6}-\d{4}-\d{3}$/i.test(q.trim())
}
