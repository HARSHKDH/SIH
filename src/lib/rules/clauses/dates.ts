import { truncate } from '../format';
import type { RuleClause } from '../types';

/**
 * Rule 6(1)(d) — month and year of manufacture, pre-packing or import.
 *
 * The rule asks for month *and* year, so a bare year is a genuine defect rather
 * than a formatting quibble. A future date is reported too: it usually means the
 * batch coder was mis-set, which is exactly the kind of thing a field inspection
 * should catch.
 */
export const rule6_1_d_manufactureDate: RuleClause = {
  code: 'LM-PCR-6(1)(d)',
  title: 'Month and year of manufacture, packing or import',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(d): every package shall bear the month and the year in which the commodity was manufactured, pre-packed or imported.',
  weight: 11,
  evaluate: (ctx) => {
    const field = ctx.extraction.mfg_date;

    if (!field.present || !field.value) {
      return {
        ruleCode: 'LM-PCR-6(1)(d)',
        ruleTitle: 'Month and year of manufacture, packing or import',
        description:
          'No date of manufacture, pre-packing or import is declared on the label.',
        severity: 'MODERATE',
        suggestedAction:
          'Require the month and year of manufacture or pre-packing to be printed or coded on every package.',
      };
    }

    const parsed = ctx.mfgDate;

    if (!parsed || (parsed.month === null && parsed.year === null)) {
      return {
        ruleCode: 'LM-PCR-6(1)(d)',
        ruleTitle: 'Month and year of manufacture, packing or import',
        description: `The text in the date position ("${truncate(field.value, 60)}") could not be read as a month and year.`,
        severity: 'MODERATE',
        suggestedAction:
          'Verify the date coding physically. If it is illegible or smudged, require the coder to be corrected.',
      };
    }

    if (!parsed.hasMonthAndYear) {
      const printed = parsed.month !== null ? 'a month but no year' : 'a year but no month';
      return {
        ruleCode: 'LM-PCR-6(1)(d)',
        ruleTitle: 'Month and year of manufacture, packing or import',
        description: `The date declaration "${truncate(field.value, 60)}" states ${printed}. Rule 6(1)(d) requires both.`,
        severity: 'MODERATE',
        suggestedAction: 'Require the date declaration to state both the month and the year.',
      };
    }

    if (parsed.isInFuture) {
      return {
        ruleCode: 'LM-PCR-6(1)(d)',
        ruleTitle: 'Month and year of manufacture, packing or import',
        description: `The declared date "${truncate(field.value, 60)}" is in the future (${String(parsed.month).padStart(2, '0')}/${parsed.year}), which cannot be a valid date of manufacture or packing.`,
        severity: 'MODERATE',
        suggestedAction:
          'Inspect the batch coding equipment at the packing premises — a future date normally indicates a mis-set coder affecting the whole batch.',
      };
    }

    return null;
  },
};
