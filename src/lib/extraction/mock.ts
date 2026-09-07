import { createHash } from 'node:crypto';

import type { BoundingBox, DeclarationField, LabelExtraction } from './schema';

/**
 * Deterministic offline extraction, used when no vision API key is configured.
 *
 * The point is that the *rest* of the pipeline stays honest: the queue, the rule
 * engine, the score, the Declaration/Violation rows and the PDF all run exactly
 * as they do in production. Only the vision call is substituted. Selection is
 * keyed off a hash of the image bytes so the same photo always yields the same
 * verdict — a demo that changes its answer on refresh is worse than no demo.
 */

function field(
  value: string | null,
  options: {
    confidence?: number;
    box?: BoundingBox;
    fontSizeMm?: number | null;
    notes?: string | null;
  } = {},
): DeclarationField {
  return {
    present: value !== null,
    value,
    confidence: value === null ? 0 : (options.confidence ?? 0.93),
    bounding_box: value === null ? null : (options.box ?? { x: 0.1, y: 0.4, width: 0.5, height: 0.06 }),
    font_size_mm_est: value === null ? null : (options.fontSizeMm ?? 2.4),
    notes: options.notes ?? null,
  };
}

const absent = (): DeclarationField => field(null);

type Archetype = { label: string; build: () => LabelExtraction };

const ARCHETYPES: Archetype[] = [
  // 1. Fully compliant retail pouch.
  {
    label: 'compliant-retail-pouch',
    build: () => ({
      manufacturer_name_address: field(
        'Manufactured by: Sundar Foods Pvt. Ltd., Plot 44, MIDC Industrial Area, Pune, Maharashtra 411026',
        { box: { x: 0.08, y: 0.62, width: 0.6, height: 0.11 }, fontSizeMm: 1.9 },
      ),
      net_quantity: field('Net Qty: 500 g', {
        box: { x: 0.62, y: 0.34, width: 0.28, height: 0.07 },
        fontSizeMm: 4.2,
      }),
      mrp: field('MRP Rs. 185.00 (inclusive of all taxes)', {
        box: { x: 0.08, y: 0.34, width: 0.44, height: 0.07 },
        fontSizeMm: 3.8,
      }),
      mfg_date: field('MFD: 02/2026', {
        box: { x: 0.08, y: 0.45, width: 0.26, height: 0.05 },
        fontSizeMm: 2.2,
      }),
      consumer_care: field('Consumer Care: care@sundarfoods.in | 1800-233-1188', {
        box: { x: 0.08, y: 0.75, width: 0.62, height: 0.05 },
        fontSizeMm: 1.8,
      }),
      country_of_origin: field('Country of Origin: India', {
        box: { x: 0.6, y: 0.75, width: 0.3, height: 0.05 },
        fontSizeMm: 1.8,
      }),
      unit_sale_price: field('Unit Sale Price: Rs. 370 per kg', {
        box: { x: 0.08, y: 0.52, width: 0.4, height: 0.05 },
        fontSizeMm: 2.0,
      }),
      relative_text_sizes: {
        principal_display_panel_area_cm2_est: 210,
        largest_text_height_mm_est: 14,
        smallest_declaration_text_height_mm_est: 1.8,
        smallest_appears_illegible: false,
        notes: 'All declarations are printed in a consistent sans-serif at legible sizes.',
      },
      image_assessment: {
        readable: true,
        is_packaged_commodity_label: true,
        issues: [],
        detected_languages: ['English', 'Hindi'],
      },
      overall_notes: 'All seven mandatory declarations are present and legible on the principal display panel.',
    }),
  },

  // 2. Missing MRP and consumer care — the classic e-commerce listing failure.
  {
    label: 'missing-mrp-and-care',
    build: () => ({
      manufacturer_name_address: field(
        'Packed by: Greenleaf Agro Industries, Survey No. 91/2, Hosur Road, Bengaluru, Karnataka 560100',
        { box: { x: 0.09, y: 0.66, width: 0.62, height: 0.1 }, fontSizeMm: 1.7 },
      ),
      net_quantity: field('1 kg', {
        box: { x: 0.65, y: 0.3, width: 0.24, height: 0.08 },
        fontSizeMm: 5.1,
      }),
      mrp: absent(),
      mfg_date: field('Packed on: 14 JAN 2026', {
        box: { x: 0.09, y: 0.44, width: 0.34, height: 0.05 },
        fontSizeMm: 2.1,
      }),
      consumer_care: absent(),
      country_of_origin: field('Made in India', {
        box: { x: 0.66, y: 0.78, width: 0.24, height: 0.04 },
        fontSizeMm: 1.6,
      }),
      unit_sale_price: absent(),
      relative_text_sizes: {
        principal_display_panel_area_cm2_est: 340,
        largest_text_height_mm_est: 18,
        smallest_declaration_text_height_mm_est: 1.6,
        smallest_appears_illegible: false,
        notes: 'Address block is small but readable against a plain background.',
      },
      image_assessment: {
        readable: true,
        is_packaged_commodity_label: true,
        issues: [],
        detected_languages: ['English'],
      },
      overall_notes:
        'No retail sale price and no consumer care contact are printed anywhere on the visible panels.',
    }),
  },

  // 3. Everything present but the small print is illegible.
  {
    label: 'illegible-small-print',
    build: () => ({
      manufacturer_name_address: field(
        'Mfd by Anandi Beverages Ltd., Unit II, Baddi, Solan, Himachal Pradesh 173205',
        {
          confidence: 0.58,
          box: { x: 0.12, y: 0.7, width: 0.58, height: 0.07 },
          fontSizeMm: 0.7,
          notes: 'Printed in very fine type over a patterned background.',
        },
      ),
      net_quantity: field('750 ml', {
        box: { x: 0.6, y: 0.36, width: 0.26, height: 0.07 },
        fontSizeMm: 3.9,
      }),
      mrp: field('M.R.P. Rs. 60/-', {
        box: { x: 0.12, y: 0.36, width: 0.32, height: 0.06 },
        fontSizeMm: 3.2,
        notes: 'No "inclusive of all taxes" wording printed.',
      }),
      mfg_date: field('MFD 11/2025', {
        confidence: 0.51,
        box: { x: 0.12, y: 0.47, width: 0.24, height: 0.04 },
        fontSizeMm: 0.8,
        notes: 'Ink-jet coding is faint and partly smudged.',
      }),
      consumer_care: field('consumer.care@anandibev.co.in', {
        confidence: 0.44,
        box: { x: 0.12, y: 0.78, width: 0.5, height: 0.04 },
        fontSizeMm: 0.6,
        notes: 'Email is legible only under magnification; no phone number printed.',
      }),
      country_of_origin: field('India', {
        box: { x: 0.66, y: 0.78, width: 0.18, height: 0.04 },
        fontSizeMm: 0.9,
      }),
      unit_sale_price: absent(),
      relative_text_sizes: {
        principal_display_panel_area_cm2_est: 165,
        largest_text_height_mm_est: 22,
        smallest_declaration_text_height_mm_est: 0.6,
        smallest_appears_illegible: true,
        notes:
          'Brand name is roughly 30x the height of the mandatory declarations, several of which fall under 1 mm.',
      },
      image_assessment: {
        readable: true,
        is_packaged_commodity_label: true,
        issues: ['fine print near the resolution limit'],
        detected_languages: ['English'],
      },
      overall_notes:
        'Declarations are technically present but the smallest are below a legible printed size.',
    }),
  },

  // 4. Imported package with no country of origin and no importer address.
  {
    label: 'imported-no-origin',
    build: () => ({
      manufacturer_name_address: field('Fjordline Seafoods AS', {
        box: { x: 0.1, y: 0.64, width: 0.4, height: 0.05 },
        fontSizeMm: 2.0,
        notes: 'Brand and company name only — no postal address of an importer is printed.',
      }),
      net_quantity: field('Net weight 250 g', {
        box: { x: 0.58, y: 0.32, width: 0.3, height: 0.07 },
        fontSizeMm: 4.0,
      }),
      mrp: field('MRP INR 640', {
        box: { x: 0.1, y: 0.32, width: 0.3, height: 0.07 },
        fontSizeMm: 3.6,
      }),
      mfg_date: absent(),
      consumer_care: field('support@fjordline.example', {
        box: { x: 0.1, y: 0.74, width: 0.44, height: 0.04 },
        fontSizeMm: 1.7,
      }),
      country_of_origin: absent(),
      unit_sale_price: absent(),
      relative_text_sizes: {
        principal_display_panel_area_cm2_est: 190,
        largest_text_height_mm_est: 16,
        smallest_declaration_text_height_mm_est: 1.7,
        smallest_appears_illegible: false,
        notes: 'Type sizes are adequate throughout.',
      },
      image_assessment: {
        readable: true,
        is_packaged_commodity_label: true,
        issues: [],
        detected_languages: ['English', 'Norwegian'],
      },
      overall_notes:
        'Appears to be an imported commodity with neither country of origin nor an importer address declared.',
    }),
  },

  // 5. Substantially compliant — only minor drafting defects remain.
  {
    label: 'minor-defects-tea-pack',
    build: () => ({
      manufacturer_name_address: field(
        'Manufactured & packed by: Nilgiri Estate Teas Pvt. Ltd., Door No. 12/4, Coonoor Road, Ooty, Tamil Nadu 643001',
        { box: { x: 0.08, y: 0.64, width: 0.64, height: 0.1 }, fontSizeMm: 2.0 },
      ),
      net_quantity: field('Net Qty. 250 g', {
        box: { x: 0.63, y: 0.33, width: 0.26, height: 0.07 },
        fontSizeMm: 4.6,
      }),
      mrp: field('MRP Rs. 320', {
        box: { x: 0.08, y: 0.33, width: 0.32, height: 0.07 },
        fontSizeMm: 3.9,
        notes: 'No "inclusive of all taxes" wording printed alongside the figure.',
      }),
      mfg_date: field('PKD: 03/2026', {
        box: { x: 0.08, y: 0.43, width: 0.26, height: 0.05 },
        fontSizeMm: 2.3,
      }),
      consumer_care: field('Consumer Care: grievance@nilgiriteas.in, Tel 1800-425-7788', {
        box: { x: 0.08, y: 0.75, width: 0.66, height: 0.05 },
        fontSizeMm: 1.9,
      }),
      country_of_origin: field('Country of Origin: India', {
        box: { x: 0.62, y: 0.75, width: 0.3, height: 0.05 },
        fontSizeMm: 1.9,
      }),
      unit_sale_price: absent(),
      relative_text_sizes: {
        principal_display_panel_area_cm2_est: 175,
        largest_text_height_mm_est: 12,
        smallest_declaration_text_height_mm_est: 1.9,
        smallest_appears_illegible: false,
        notes: 'Declarations are grouped on the back panel at a consistent, readable size.',
      },
      image_assessment: {
        readable: true,
        is_packaged_commodity_label: true,
        issues: [],
        detected_languages: ['English', 'Tamil'],
      },
      overall_notes:
        'All mandatory declarations are present and legible; only the tax-inclusive wording and the unit sale price are absent.',
    }),
  },

  // 6. Net quantity present but no unit and a partly obscured panel.
  {
    label: 'unitless-quantity',
    build: () => ({
      manufacturer_name_address: field(
        'Marketed by: Nova Retail Brands, 3rd Floor, Cyber Towers, Hyderabad, Telangana 500081',
        { box: { x: 0.1, y: 0.68, width: 0.6, height: 0.09 }, fontSizeMm: 1.8 },
      ),
      net_quantity: field('Net Qty: 12', {
        confidence: 0.72,
        box: { x: 0.62, y: 0.35, width: 0.22, height: 0.06 },
        fontSizeMm: 3.4,
        notes: 'No unit of measure follows the numeral.',
      }),
      mrp: field('MRP Rs. 249 incl. of all taxes', {
        box: { x: 0.1, y: 0.35, width: 0.44, height: 0.06 },
        fontSizeMm: 3.3,
      }),
      mfg_date: field('MFG: 12/25', {
        box: { x: 0.1, y: 0.44, width: 0.22, height: 0.04 },
        fontSizeMm: 2.0,
      }),
      consumer_care: field('Customer Care: 1800-102-9000', {
        box: { x: 0.1, y: 0.79, width: 0.42, height: 0.04 },
        fontSizeMm: 1.8,
      }),
      country_of_origin: field('Country of Origin: India', {
        box: { x: 0.6, y: 0.79, width: 0.3, height: 0.04 },
        fontSizeMm: 1.8,
      }),
      unit_sale_price: absent(),
      relative_text_sizes: {
        principal_display_panel_area_cm2_est: 260,
        largest_text_height_mm_est: 15,
        smallest_declaration_text_height_mm_est: 1.8,
        smallest_appears_illegible: false,
        notes: 'Legible throughout.',
      },
      image_assessment: {
        readable: true,
        is_packaged_commodity_label: true,
        issues: ['lower-right corner of the panel is behind a price sticker'],
        detected_languages: ['English'],
      },
      overall_notes: 'Net quantity numeral is printed without a unit of measure.',
    }),
  },
];

/** Stable index in [0, ARCHETYPES.length) derived from the image bytes. */
function archetypeIndexFor(imageBytes: Buffer): number {
  const digest = createHash('sha256').update(imageBytes).digest();
  return digest.readUInt32BE(0) % ARCHETYPES.length;
}

export interface MockExtractionResult {
  extraction: LabelExtraction;
  meta: {
    model: string;
    inputTokens: null;
    outputTokens: null;
    mediaType: string;
    source: 'mock';
    archetype: string;
  };
}

export function extractWithMock(imageBytes: Buffer, mediaType: string): MockExtractionResult {
  const archetype = ARCHETYPES[archetypeIndexFor(imageBytes)];
  return {
    extraction: archetype.build(),
    meta: {
      model: 'mock-extractor',
      inputTokens: null,
      outputTokens: null,
      mediaType,
      source: 'mock',
      archetype: archetype.label,
    },
  };
}

/** Exposed for the seed script so demo scans reuse the same archetypes. */
export function mockArchetypeByName(name: string): LabelExtraction | null {
  return ARCHETYPES.find((a) => a.label === name)?.build() ?? null;
}

export const MOCK_ARCHETYPE_NAMES = ARCHETYPES.map((a) => a.label);
