import { truncate } from '../format';
import type { RuleClause } from '../types';

/**
 * Rule 6(1)(c) — declaration of net quantity.
 *
 * Three distinct failures live here, and they are reported separately because
 * they call for different enforcement action: nothing declared at all, a numeral
 * with no unit, and a declaration that could not be parsed as a quantity.
 */
export const rule6_1_c_netQuantity: RuleClause = {
  code: 'LM-PCR-6(1)(c)',
  title: 'Net quantity declaration',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(c): every package shall bear the net quantity, in terms of standard units of weight or measure, or in number.',
  weight: 18,
  evaluate: (ctx) => {
    const field = ctx.extraction.net_quantity;

    if (!field.present || !field.value) {
      return {
        ruleCode: 'LM-PCR-6(1)(c)',
        ruleTitle: 'Net quantity declaration',
        description: 'No net quantity is declared on the label.',
        severity: 'CRITICAL',
        suggestedAction:
          'Direct the packer to declare the net quantity in standard units on the principal display panel.',
      };
    }

    const parsed = ctx.netQuantity;

    if (!parsed || parsed.amount === null) {
      return {
        ruleCode: 'LM-PCR-6(1)(c)',
        ruleTitle: 'Net quantity declaration',
        description: `The text in the net quantity position ("${truncate(field.value, 60)}") does not state a numerical quantity.`,
        severity: 'CRITICAL',
        suggestedAction:
          'Require a clear numerical net quantity followed by the prescribed unit of weight, measure or number.',
      };
    }

    if (parsed.missingUnit) {
      return {
        ruleCode: 'LM-PCR-6(1)(c)',
        ruleTitle: 'Net quantity declaration',
        description: `The net quantity is printed as "${truncate(field.value, 60)}" — a numeral with no unit of weight, measure or number, so the declaration is incomplete.`,
        severity: 'CRITICAL',
        suggestedAction:
          'Require the unit of measure (for example g, kg, ml, L, or N for number) to be printed immediately after the numeral.',
      };
    }

    return null;
  },
};

/**
 * Rule 8 — net quantity must be expressed in the prescribed metric units.
 *
 * Only reachable once Rule 6(1)(c) has confirmed a parseable quantity exists,
 * which is why this is a separate clause rather than another branch above.
 */
export const rule8_netQuantityUnits: RuleClause = {
  code: 'LM-PCR-8',
  title: 'Prescribed unit of weight or measure',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 8 read with the Legal Metrology Act, 2009 s.10: quantities shall be declared only in the units established by or under the Act.',
  weight: 6,
  appliesTo: (ctx) => {
    const parsed = ctx.netQuantity;
    return !!parsed && parsed.amount !== null && !parsed.missingUnit;
  },
  evaluate: (ctx) => {
    const parsed = ctx.netQuantity;
    if (!parsed) return null;

    if (parsed.usesNonMetricUnit) {
      return {
        ruleCode: 'LM-PCR-8',
        ruleTitle: 'Prescribed unit of weight or measure',
        description: `The net quantity is declared in a non-metric unit ("${parsed.unitAsPrinted}"), which is not a unit established under the Legal Metrology Act, 2009.`,
        severity: 'MODERATE',
        suggestedAction:
          'Require the net quantity to be declared in metric units. A non-metric equivalent may appear only in addition to, and not instead of, the metric declaration.',
      };
    }

    if (parsed.canonicalUnit === null) {
      return {
        ruleCode: 'LM-PCR-8',
        ruleTitle: 'Prescribed unit of weight or measure',
        description: `The unit printed after the net quantity ("${parsed.unitAsPrinted}") is not a recognised unit of weight, measure or number.`,
        severity: 'MODERATE',
        suggestedAction:
          'Verify the declaration physically and require a prescribed unit symbol (g, kg, ml, L, m, cm or N) to be used.',
      };
    }

    return null;
  },
};
