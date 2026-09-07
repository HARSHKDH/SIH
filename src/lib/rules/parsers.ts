/**
 * Small, focused parsers that turn the label's free text into facts the clause
 * functions can reason about.
 *
 * These stay conservative on purpose: when a string cannot be parsed with
 * confidence the parser reports that, and the clause treats "unparseable" as a
 * distinct outcome from "absent". Guessing here would put words in the label's
 * mouth.
 */

// ---------------------------------------------------------------------------
// Net quantity
// ---------------------------------------------------------------------------

export type QuantityKind = 'weight' | 'volume' | 'length' | 'number' | 'unknown';

export interface ParsedNetQuantity {
  raw: string;
  amount: number | null;
  /** The unit token exactly as printed, e.g. "gm". */
  unitAsPrinted: string | null;
  /** Normalised SI-ish unit, e.g. "g". Null when the unit is not recognised. */
  canonicalUnit: string | null;
  kind: QuantityKind;
  /** True when a numeral was found but no unit of measure followed it. */
  missingUnit: boolean;
  /** True when the declared unit is non-metric (oz, lb, fl oz, pint...). */
  usesNonMetricUnit: boolean;
  /** Amount converted to the base unit (g, ml, cm or count) for threshold checks. */
  baseAmount: number | null;
}

/** Units permitted for a net quantity declaration under the Legal Metrology Act. */
const METRIC_UNITS: Record<string, { canonical: string; kind: QuantityKind; toBase: number }> = {
  mg: { canonical: 'mg', kind: 'weight', toBase: 0.001 },
  g: { canonical: 'g', kind: 'weight', toBase: 1 },
  gm: { canonical: 'g', kind: 'weight', toBase: 1 },
  gms: { canonical: 'g', kind: 'weight', toBase: 1 },
  gram: { canonical: 'g', kind: 'weight', toBase: 1 },
  grams: { canonical: 'g', kind: 'weight', toBase: 1 },
  kg: { canonical: 'kg', kind: 'weight', toBase: 1000 },
  kgs: { canonical: 'kg', kind: 'weight', toBase: 1000 },
  kilogram: { canonical: 'kg', kind: 'weight', toBase: 1000 },
  kilograms: { canonical: 'kg', kind: 'weight', toBase: 1000 },
  ml: { canonical: 'ml', kind: 'volume', toBase: 1 },
  millilitre: { canonical: 'ml', kind: 'volume', toBase: 1 },
  millilitres: { canonical: 'ml', kind: 'volume', toBase: 1 },
  milliliter: { canonical: 'ml', kind: 'volume', toBase: 1 },
  milliliters: { canonical: 'ml', kind: 'volume', toBase: 1 },
  cl: { canonical: 'cl', kind: 'volume', toBase: 10 },
  l: { canonical: 'l', kind: 'volume', toBase: 1000 },
  lt: { canonical: 'l', kind: 'volume', toBase: 1000 },
  ltr: { canonical: 'l', kind: 'volume', toBase: 1000 },
  litre: { canonical: 'l', kind: 'volume', toBase: 1000 },
  litres: { canonical: 'l', kind: 'volume', toBase: 1000 },
  liter: { canonical: 'l', kind: 'volume', toBase: 1000 },
  liters: { canonical: 'l', kind: 'volume', toBase: 1000 },
  mm: { canonical: 'mm', kind: 'length', toBase: 0.1 },
  cm: { canonical: 'cm', kind: 'length', toBase: 1 },
  m: { canonical: 'm', kind: 'length', toBase: 100 },
  // "N" is the prescribed symbol for a declaration by number.
  n: { canonical: 'N', kind: 'number', toBase: 1 },
  no: { canonical: 'N', kind: 'number', toBase: 1 },
  nos: { canonical: 'N', kind: 'number', toBase: 1 },
  pc: { canonical: 'N', kind: 'number', toBase: 1 },
  pcs: { canonical: 'N', kind: 'number', toBase: 1 },
  piece: { canonical: 'N', kind: 'number', toBase: 1 },
  pieces: { canonical: 'N', kind: 'number', toBase: 1 },
  unit: { canonical: 'N', kind: 'number', toBase: 1 },
  units: { canonical: 'N', kind: 'number', toBase: 1 },
};

/** Imperial/US units, which may not be used for the statutory declaration. */
const NON_METRIC_UNITS = new Set([
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
  'floz',
  'pint',
  'pints',
  'quart',
  'quarts',
  'gallon',
  'gallons',
  'inch',
  'inches',
  'ft',
  'foot',
  'feet',
]);

const QUANTITY_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|[a-zA-Z]{1,12}\.?)?/;

export function parseNetQuantity(raw: string | null | undefined): ParsedNetQuantity | null {
  if (!raw) return null;

  // Strip the label prefix ("Net Qty:", "Net weight", "Net content") so the
  // numeral we match is the quantity and not something in the prefix.
  const cleaned = raw
    .replace(/net\s*(qty|quantity|weight|wt|content|contents|vol|volume)\s*[:.\-]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = QUANTITY_PATTERN.exec(cleaned);
  if (!match) {
    return {
      raw,
      amount: null,
      unitAsPrinted: null,
      canonicalUnit: null,
      kind: 'unknown',
      missingUnit: true,
      usesNonMetricUnit: false,
      baseAmount: null,
    };
  }

  const amount = Number.parseFloat(match[1].replace(',', '.'));
  const unitToken = (match[2] ?? '').replace(/\./g, '').replace(/\s+/g, '').toLowerCase();

  if (!unitToken) {
    return {
      raw,
      amount: Number.isFinite(amount) ? amount : null,
      unitAsPrinted: null,
      canonicalUnit: null,
      kind: 'unknown',
      missingUnit: true,
      usesNonMetricUnit: false,
      baseAmount: null,
    };
  }

  const metric = METRIC_UNITS[unitToken];
  if (metric) {
    return {
      raw,
      amount: Number.isFinite(amount) ? amount : null,
      unitAsPrinted: match[2]?.trim() ?? null,
      canonicalUnit: metric.canonical,
      kind: metric.kind,
      missingUnit: false,
      usesNonMetricUnit: false,
      baseAmount: Number.isFinite(amount) ? amount * metric.toBase : null,
    };
  }

  return {
    raw,
    amount: Number.isFinite(amount) ? amount : null,
    unitAsPrinted: match[2]?.trim() ?? null,
    canonicalUnit: null,
    kind: 'unknown',
    missingUnit: false,
    usesNonMetricUnit: NON_METRIC_UNITS.has(unitToken),
    baseAmount: null,
  };
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export interface ParsedPrice {
  raw: string;
  amount: number | null;
  /** True when ₹ / Rs. / INR appears alongside the figure. */
  hasCurrencyMarker: boolean;
  /** True when the label carries the "inclusive of all taxes" wording. */
  statesInclusiveOfTaxes: boolean;
  /** For unit sale price: the "per kg" / "per 100 g" part, if printed. */
  perUnit: string | null;
}

const CURRENCY_PATTERN = /(?:₹|\brs\b\.?|\binr\b|\brupees?\b)/i;
const AMOUNT_WITH_CURRENCY = /(?:₹|\brs\b\.?|\binr\b)\s*([\d,]+(?:\.\d{1,2})?)/i;
const BARE_AMOUNT = /([\d,]+(?:\.\d{1,2})?)/;
const INCLUSIVE_OF_TAXES =
  /incl(?:usive|\.)?\s*(?:of)?\s*all\s*tax(?:es)?|incl\.?\s*of\s*all\s*taxes|inclusive\s*of\s*taxes/i;
const PER_UNIT_PATTERN = /per\s+((?:\d+\s*)?[a-zA-Z]{1,12})/i;

export function parsePrice(raw: string | null | undefined): ParsedPrice | null {
  if (!raw) return null;

  const withCurrency = AMOUNT_WITH_CURRENCY.exec(raw);
  const bare = withCurrency ? null : BARE_AMOUNT.exec(raw);
  const amountText = withCurrency?.[1] ?? bare?.[1] ?? null;
  const amount = amountText ? Number.parseFloat(amountText.replace(/,/g, '')) : null;
  const perUnit = PER_UNIT_PATTERN.exec(raw);

  return {
    raw,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    hasCurrencyMarker: CURRENCY_PATTERN.test(raw),
    statesInclusiveOfTaxes: INCLUSIVE_OF_TAXES.test(raw),
    perUnit: perUnit ? perUnit[1].trim() : null,
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export interface ParsedDate {
  raw: string;
  month: number | null;
  year: number | null;
  /** Rule 6(1)(d) needs month AND year; a bare year is not enough. */
  hasMonthAndYear: boolean;
  /** A date after today indicates a misprint or a mis-set coder. */
  isInFuture: boolean;
  /** What the label calls it: manufacture, packing or import. */
  kind: 'manufacture' | 'packing' | 'import' | 'unspecified';
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function normaliseYear(value: number): number {
  if (value >= 1000) return value;
  // Two-digit years: "25" -> 2025. Anything beyond the near future is treated
  // as the 1900s, which keeps "98" reading as 1998 rather than 2098.
  const currentShortYear = new Date().getUTCFullYear() % 100;
  return value <= currentShortYear + 5 ? 2000 + value : 1900 + value;
}

function detectDateKind(raw: string): ParsedDate['kind'] {
  if (/\bimport(?:ed)?\b/i.test(raw)) return 'import';
  if (/\b(pkd|packed|packing|pack\s*date)\b/i.test(raw)) return 'packing';
  if (/\b(mfd|mfg|manufactur\w*|made)\b/i.test(raw)) return 'manufacture';
  return 'unspecified';
}

export function parseMfgDate(raw: string | null | undefined): ParsedDate | null {
  if (!raw) return null;

  const kind = detectDateKind(raw);
  const now = new Date();
  let month: number | null = null;
  let year: number | null = null;

  // "MM/YYYY", "MM-YY", "MM.YYYY" — the most common coder format.
  const numeric = /\b(\d{1,2})\s*[/\-.]\s*(\d{2,4})\b/.exec(raw);
  // "12 JAN 2026" / "JAN 2026" / "January 2026"
  const named = /\b(?:(\d{1,2})\s+)?([a-zA-Z]{3,9})\.?\s*,?\s*(\d{2,4})\b/.exec(raw);
  // "2026-01" / "2026/01"
  const isoish = /\b(\d{4})\s*[/\-]\s*(\d{1,2})\b/.exec(raw);

  if (isoish) {
    year = Number.parseInt(isoish[1], 10);
    month = Number.parseInt(isoish[2], 10);
  } else if (named && MONTH_NAMES[named[2].toLowerCase()] !== undefined) {
    month = MONTH_NAMES[named[2].toLowerCase()];
    year = normaliseYear(Number.parseInt(named[3], 10));
  } else if (numeric) {
    const first = Number.parseInt(numeric[1], 10);
    if (first >= 1 && first <= 12) month = first;
    year = normaliseYear(Number.parseInt(numeric[2], 10));
  } else {
    const bareYear = /\b(20\d{2}|19\d{2})\b/.exec(raw);
    if (bareYear) year = Number.parseInt(bareYear[1], 10);
  }

  if (month !== null && (month < 1 || month > 12)) month = null;

  const hasMonthAndYear = month !== null && year !== null;
  let isInFuture = false;
  if (year !== null) {
    const probe = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
    // Compare against the first day of next month so "MFD this month" is fine.
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    isInFuture = probe.getTime() >= startOfNextMonth.getTime();
  }

  return { raw, month, year, hasMonthAndYear, isInFuture, kind };
}

// ---------------------------------------------------------------------------
// Contact details and addresses
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Indian phone numbers: 10-digit mobiles, toll-free 1800 blocks, STD landlines.
const PHONE_PATTERN = /(?:\+?91[\s-]?)?(?:1800[\s-]?\d{3}[\s-]?\d{3,4}|0?\d{2,4}[\s-]?\d{6,8}|\d{10})/;
const PIN_CODE_PATTERN = /\b[1-9]\d{5}\b/;

export function hasEmail(value: string | null | undefined): boolean {
  return !!value && EMAIL_PATTERN.test(value);
}

export function hasPhoneNumber(value: string | null | undefined): boolean {
  if (!value) return false;
  const digitsOnly = value.replace(/\D/g, '');
  // Guard against a PIN code or a price being mistaken for a phone number.
  if (digitsOnly.length < 8) return false;
  return PHONE_PATTERN.test(value);
}

export interface AddressAssessment {
  raw: string;
  hasPinCode: boolean;
  /** Street / plot / locality tokens that distinguish an address from a brand. */
  hasStreetToken: boolean;
  /** Comma-separated segments, a decent proxy for address structure. */
  segmentCount: number;
  /** Our overall judgement that this is a postal address, not just a name. */
  looksLikePostalAddress: boolean;
}

const STREET_TOKENS =
  /\b(plot|survey|sy\.?\s*no|khasra|gala|shed|unit|block|phase|sector|road|rd|street|st|lane|marg|nagar|colony|village|taluka|tehsil|district|dist|industrial|midc|sipcot|estate|complex|tower|floor|building|bldg|po|p\.o|near|opp|behind|highway|bypass)\b/i;

const INDIAN_STATES =
  /\b(andhra pradesh|arunachal pradesh|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal pradesh|jharkhand|karnataka|kerala|madhya pradesh|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|orissa|punjab|rajasthan|sikkim|tamil nadu|telangana|tripura|uttar pradesh|uttarakhand|west bengal|delhi|puducherry|chandigarh|jammu|kashmir|ladakh|andaman)\b/i;

export function assessAddress(raw: string | null | undefined): AddressAssessment | null {
  if (!raw) return null;

  const hasPinCode = PIN_CODE_PATTERN.test(raw);
  const hasStreetToken = STREET_TOKENS.test(raw);
  const hasState = INDIAN_STATES.test(raw);
  const segmentCount = raw.split(',').map((s) => s.trim()).filter(Boolean).length;

  // A complete address realistically carries at least two of: a PIN code, a
  // street/locality token, a state name, or three or more comma segments.
  const signals = [hasPinCode, hasStreetToken, hasState, segmentCount >= 3].filter(Boolean).length;

  return {
    raw,
    hasPinCode,
    hasStreetToken,
    segmentCount,
    looksLikePostalAddress: signals >= 2 && raw.trim().length >= 20,
  };
}

// ---------------------------------------------------------------------------
// Import signals
// ---------------------------------------------------------------------------

const IMPORT_KEYWORDS =
  /\b(import(?:ed|er)?\s*(?:by)?|marketed\s*&?\s*imported|country\s*of\s*origin)\b/i;

const FOREIGN_ORIGIN =
  /\b(china|prc|vietnam|thailand|indonesia|malaysia|singapore|japan|korea|taiwan|usa|u\.s\.a|united states|germany|france|italy|spain|netherlands|belgium|switzerland|norway|sweden|denmark|poland|turkey|uae|dubai|saudi|australia|new zealand|brazil|mexico|canada|united kingdom|u\.k|england|bangladesh|sri lanka|nepal|egypt|south africa)\b/i;

/**
 * Collects observable reasons to think the package is imported. This does not
 * decide compliance; it only calibrates how serious a missing country-of-origin
 * declaration is.
 */
export function detectImportSignals(input: {
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  detectedLanguages: readonly string[];
  productName: string | null;
}): string[] {
  const signals: string[] = [];
  const haystack = [input.manufacturerAddress, input.productName].filter(Boolean).join(' ');

  if (IMPORT_KEYWORDS.test(haystack)) {
    signals.push('label text refers to an importer or country of origin');
  }
  if (FOREIGN_ORIGIN.test(haystack)) {
    signals.push('manufacturer or product text names a country other than India');
  }
  if (input.countryOfOrigin && !/\bindia\b/i.test(input.countryOfOrigin)) {
    signals.push(`declared country of origin is "${input.countryOfOrigin.trim()}"`);
  }
  const foreignLanguage = input.detectedLanguages.find(
    (lang) =>
      !/^(english|hindi|bengali|marathi|telugu|tamil|gujarati|urdu|kannada|odia|malayalam|punjabi|assamese)$/i.test(
        lang.trim(),
      ),
  );
  if (foreignLanguage) {
    signals.push(`non-Indian language on the label (${foreignLanguage})`);
  }
  if (input.manufacturerAddress && !PIN_CODE_PATTERN.test(input.manufacturerAddress)) {
    // Weak on its own, so it is only recorded when something else already hints
    // at an import.
    if (signals.length > 0) signals.push('no Indian PIN code in the declared address');
  }

  return signals;
}
