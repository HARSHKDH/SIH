import type { RuleClause } from '../types';

/**
 * Country of origin.
 *
 * Strictly this bites on imported pre-packaged commodities, and there is no way
 * to know from a photograph alone whether a package was imported. Rather than
 * either ignoring the declaration or crying wolf on every domestic pouch, the
 * clause always reports the omission but grades it by the evidence: MODERATE when
 * something on the label points to an import, MINOR otherwise. The observed
 * signals are quoted in the finding so the officer can judge for themselves.
 */
export const rule6_1_countryOfOrigin: RuleClause = {
  code: 'LM-PCR-6(1)-COO',
  title: 'Country of origin',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1) as amended in 2017, read with Rule 6(10) for e-commerce listings: imported pre-packaged commodities shall declare the country of origin.',
  weight: 7,
  evaluate: (ctx) => {
    const field = ctx.extraction.country_of_origin;
    if (field.present && field.value) return null;

    const signals = ctx.importSignals;
    const importSuspected = signals.length > 0;

    return {
      ruleCode: 'LM-PCR-6(1)-COO',
      ruleTitle: 'Country of origin',
      description: importSuspected
        ? `No country of origin is declared, and the package appears to be imported (${signals.join('; ')}).`
        : 'No country of origin is declared on the label. This is mandatory for imported pre-packaged commodities and for e-commerce listings; no evidence of import was visible on this label.',
      severity: importSuspected ? 'MODERATE' : 'MINOR',
      suggestedAction: importSuspected
        ? 'Establish the origin of the consignment from the import documents and require the country of origin to be declared on the package.'
        : 'Confirm with the packer whether the commodity is imported. If it is, require a country of origin declaration.',
    };
  },
};
