import { truncate } from '../format';
import type { RuleClause } from '../types';

/**
 * Rule 6(1)(e) — retail sale price.
 *
 * This is the declaration consumers are overcharged against most often, so a
 * missing or unreadable MRP is treated as critical.
 */
export const rule6_1_e_retailSalePrice: RuleClause = {
  code: 'LM-PCR-6(1)(e)',
  title: 'Retail sale price (MRP)',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(e): every package shall bear the retail sale price, declared as "Maximum Retail Price Rs. ... inclusive of all taxes".',
  weight: 18,
  evaluate: (ctx) => {
    const field = ctx.extraction.mrp;

    if (!field.present || !field.value) {
      return {
        ruleCode: 'LM-PCR-6(1)(e)',
        ruleTitle: 'Retail sale price (MRP)',
        description: 'No retail sale price (MRP) is declared on the label.',
        severity: 'CRITICAL',
        suggestedAction:
          'Direct the manufacturer or packer to declare the maximum retail price on the package before it is offered for retail sale.',
      };
    }

    const parsed = ctx.mrp;

    if (!parsed || parsed.amount === null) {
      return {
        ruleCode: 'LM-PCR-6(1)(e)',
        ruleTitle: 'Retail sale price (MRP)',
        description: `The text in the price position ("${truncate(field.value, 60)}") does not state a readable price figure.`,
        severity: 'CRITICAL',
        suggestedAction: 'Verify the price declaration physically and require a legible numerical MRP to be printed.',
      };
    }

    if (!parsed.hasCurrencyMarker) {
      return {
        ruleCode: 'LM-PCR-6(1)(e)',
        ruleTitle: 'Retail sale price (MRP)',
        description: `The price is printed as "${truncate(field.value, 60)}" with no currency indication, so the figure is ambiguous.`,
        severity: 'MODERATE',
        suggestedAction: 'Require the price to be prefixed with "Rs." or the rupee symbol.',
      };
    }

    return null;
  },
};

/**
 * Rule 6(1)(e), proviso — the price must be declared as inclusive of all taxes.
 *
 * Split out from the clause above so that a package with a perfectly legible
 * price but missing tax wording loses four points rather than eighteen. The
 * severity of a finding should track the seriousness of the defect.
 */
export const rule6_1_e_taxInclusiveWording: RuleClause = {
  code: 'LM-PCR-6(1)(e)-TAX',
  title: 'Price declared inclusive of all taxes',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(e), proviso: the retail sale price shall be declared with the words "inclusive of all taxes".',
  weight: 4,
  // Only meaningful when a price was actually found.
  appliesTo: (ctx) => ctx.extraction.mrp.present && ctx.mrp?.amount !== null,
  evaluate: (ctx) => {
    const parsed = ctx.mrp;
    if (!parsed) return null;

    if (!parsed.statesInclusiveOfTaxes) {
      return {
        ruleCode: 'LM-PCR-6(1)(e)-TAX',
        ruleTitle: 'Price declared inclusive of all taxes',
        description: `The MRP is printed as "${truncate(parsed.raw, 60)}" without the mandatory "inclusive of all taxes" wording.`,
        severity: 'MINOR',
        suggestedAction:
          'Require the price declaration to read "Maximum Retail Price Rs. ... (inclusive of all taxes)" on the next print run.',
      };
    }

    return null;
  },
};

/**
 * Rule 6(1) — unit sale price.
 *
 * Only applied where a per-unit price is actually meaningful, i.e. the commodity
 * is sold by weight or measure. Flagging it on a pack of 12 pens would be noise,
 * and noise is what stops officers trusting a tool like this.
 */
export const rule6_1_unitSalePrice: RuleClause = {
  code: 'LM-PCR-6(1)-USP',
  title: 'Unit sale price',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1) read with Rule 2(m): where a commodity is sold by weight or measure, the unit sale price shall also be declared.',
  weight: 3,
  appliesTo: (ctx) => {
    const parsed = ctx.netQuantity;
    if (!parsed || parsed.canonicalUnit === null) return false;
    return parsed.kind === 'weight' || parsed.kind === 'volume';
  },
  evaluate: (ctx) => {
    const field = ctx.extraction.unit_sale_price;

    if (!field.present || !field.value) {
      return {
        ruleCode: 'LM-PCR-6(1)-USP',
        ruleTitle: 'Unit sale price',
        description: `The commodity is sold by ${ctx.netQuantity?.kind === 'volume' ? 'measure' : 'weight'} (${ctx.netQuantity?.raw?.trim() ?? 'quantity declared'}) but no unit sale price is declared.`,
        severity: 'MINOR',
        suggestedAction:
          'Advise the packer to declare the unit sale price (for example "Rs. 370 per kg") alongside the retail sale price.',
      };
    }

    const parsed = ctx.unitSalePrice;

    if (parsed && parsed.amount !== null && parsed.perUnit === null) {
      return {
        ruleCode: 'LM-PCR-6(1)-USP',
        ruleTitle: 'Unit sale price',
        description: `A unit sale price figure is printed ("${truncate(field.value, 60)}") but it does not state the unit it applies to, so it cannot be compared against other pack sizes.`,
        severity: 'MINOR',
        suggestedAction: 'Require the unit sale price to name its reference unit, for example "per kg" or "per 100 g".',
      };
    }

    return null;
  },
};
