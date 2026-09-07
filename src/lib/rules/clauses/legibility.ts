import { DECLARATION_KEYS } from '@/lib/extraction/schema';
import { DECLARATION_LABEL_INLINE } from '@/lib/labels';

import { mm } from '../format';
import type { RuleClause, RuleContext } from '../types';

/** Absolute floor for the printed height of any mandatory declaration. */
const MIN_LETTER_HEIGHT_MM = 1;

/**
 * Rule 9, Third Schedule — minimum height of the net quantity numeral, which
 * scales with the area of the principal display panel. A 1 mm numeral is
 * acceptable on a sachet and plainly inadequate on a 5 kg sack.
 */
const NUMERAL_HEIGHT_BY_PDP_AREA: ReadonlyArray<{
  maxAreaCm2: number;
  minHeightMm: number;
  band: string;
}> = [
  { maxAreaCm2: 100, minHeightMm: 1, band: 'up to 100 cm²' },
  { maxAreaCm2: 500, minHeightMm: 2, band: 'over 100 and up to 500 cm²' },
  { maxAreaCm2: 2500, minHeightMm: 4, band: 'over 500 and up to 2,500 cm²' },
  { maxAreaCm2: Number.POSITIVE_INFINITY, minHeightMm: 6, band: 'over 2,500 cm²' },
];

function requiredNumeralHeight(areaCm2: number) {
  return (
    NUMERAL_HEIGHT_BY_PDP_AREA.find((band) => areaCm2 <= band.maxAreaCm2) ??
    NUMERAL_HEIGHT_BY_PDP_AREA[NUMERAL_HEIGHT_BY_PDP_AREA.length - 1]
  );
}

/** Declarations that are present and carry a millimetre estimate. */
function measuredDeclarations(ctx: RuleContext) {
  return DECLARATION_KEYS.flatMap((key) => {
    const field = ctx.extraction[key];
    if (!field.present || field.font_size_mm_est === null) return [];
    return [{ key, label: DECLARATION_LABEL_INLINE[key], heightMm: field.font_size_mm_est }];
  });
}

/**
 * Rule 9(1) — declarations must be legible, prominent and conspicuous.
 *
 * This is the one clause that leans on the vision model's judgement rather than
 * a measurement, because legibility is a qualitative test in the rule itself:
 * contrast, background clutter and print quality all matter, not just height.
 */
export const rule9_1_legibility: RuleClause = {
  code: 'LM-PCR-9(1)',
  title: 'Legibility and prominence of declarations',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 9(1): declarations shall be legible, prominent, conspicuous and in a colour that contrasts with the background.',
  weight: 6,
  evaluate: (ctx) => {
    const sizes = ctx.extraction.relative_text_sizes;
    if (!sizes.smallest_appears_illegible) return null;

    const smallest = sizes.smallest_declaration_text_height_mm_est;
    const largest = sizes.largest_text_height_mm_est;

    const parts = ['The smallest mandatory declaration on this package is not legibly printed.'];
    if (smallest !== null) parts.push(`Smallest declaration measures about ${mm(smallest)}.`);
    if (smallest !== null && largest !== null && smallest > 0) {
      const ratio = Math.round(largest / smallest);
      if (ratio >= 5) {
        parts.push(
          `The largest text on the panel is roughly ${ratio}× that height, so the mandatory declarations are not prominent relative to the branding.`,
        );
      }
    }
    if (sizes.notes) parts.push(sizes.notes.trim());

    return {
      ruleCode: 'LM-PCR-9(1)',
      ruleTitle: 'Legibility and prominence of declarations',
      description: parts.join(' '),
      severity: 'MODERATE',
      suggestedAction:
        'Require the mandatory declarations to be reprinted at a legible size in a colour that contrasts with the background, clear of seams and decorative artwork.',
    };
  },
};

/**
 * Rule 9(2) — no letter or numeral in a mandatory declaration below 1 mm.
 * A hard floor, independent of panel size.
 */
export const rule9_2_minimumLetterHeight: RuleClause = {
  code: 'LM-PCR-9(2)',
  title: 'Minimum height of letters and numerals',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 9(2): the height of any letter or numeral in a mandatory declaration shall not be less than 1 mm.',
  weight: 4,
  appliesTo: (ctx) => measuredDeclarations(ctx).length > 0,
  evaluate: (ctx) => {
    const undersized = measuredDeclarations(ctx)
      .filter((d) => d.heightMm < MIN_LETTER_HEIGHT_MM)
      .sort((a, b) => a.heightMm - b.heightMm);

    if (undersized.length === 0) return null;

    const listed = undersized.map((d) => `${d.label} (~${mm(d.heightMm)})`).join(', ');

    return {
      ruleCode: 'LM-PCR-9(2)',
      ruleTitle: 'Minimum height of letters and numerals',
      description: `${undersized.length} mandatory ${
        undersized.length === 1 ? 'declaration is' : 'declarations are'
      } printed below the 1 mm minimum letter height: ${listed}.`,
      severity: 'MODERATE',
      suggestedAction:
        'Require the artwork to be revised so that every mandatory declaration is printed at a letter height of at least 1 mm.',
    };
  },
};

/**
 * Rule 9, Third Schedule — the net quantity numeral must scale with the size of
 * the principal display panel.
 *
 * Applies only when both the panel area and the numeral height could be
 * estimated. Without both, the honest answer is "not assessed", not "passed" —
 * so the clause is excluded from the score rather than silently satisfied.
 */
export const rule9_3_netQuantityNumeralHeight: RuleClause = {
  code: 'LM-PCR-9(3)',
  title: 'Net quantity numeral height for panel size',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 9 read with the Third Schedule: minimum height of the net quantity numeral by area of the principal display panel.',
  weight: 4,
  appliesTo: (ctx) => {
    const field = ctx.extraction.net_quantity;
    return (
      field.present &&
      field.font_size_mm_est !== null &&
      ctx.extraction.relative_text_sizes.principal_display_panel_area_cm2_est !== null
    );
  },
  evaluate: (ctx) => {
    const height = ctx.extraction.net_quantity.font_size_mm_est;
    const area = ctx.extraction.relative_text_sizes.principal_display_panel_area_cm2_est;
    if (height === null || area === null) return null;

    const band = requiredNumeralHeight(area);
    if (height >= band.minHeightMm) return null;

    return {
      ruleCode: 'LM-PCR-9(3)',
      ruleTitle: 'Net quantity numeral height for panel size',
      description: `The net quantity numeral measures about ${mm(height)}. For a principal display panel of roughly ${Math.round(area)} cm² (${band.band}) the Third Schedule requires at least ${mm(band.minHeightMm)}.`,
      severity: 'MODERATE',
      suggestedAction: `Require the net quantity numeral to be reprinted at a height of at least ${mm(band.minHeightMm)} for this panel size.`,
    };
  },
};
