import { truncate } from '../format';
import { assessAddress, hasEmail, hasPhoneNumber } from '../parsers';
import type { RuleClause } from '../types';

/**
 * Rule 6(1)(a) — name and complete address of the manufacturer, packer or importer.
 *
 * The interesting case is not absence but partial compliance: a great many
 * packages print a brand name and stop. `assessAddress` is what separates
 * "Fjordline Seafoods AS" from a genuine postal address, and the clause reports
 * those two situations differently because the remedy differs.
 */
export const rule6_1_a_manufacturerAddress: RuleClause = {
  code: 'LM-PCR-6(1)(a)',
  title: 'Name and address of manufacturer, packer or importer',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(a): every package shall bear the name and complete address of the manufacturer, or of the packer or importer.',
  weight: 18,
  evaluate: (ctx) => {
    const field = ctx.extraction.manufacturer_name_address;

    if (!field.present || !field.value) {
      return {
        ruleCode: 'LM-PCR-6(1)(a)',
        ruleTitle: 'Name and address of manufacturer, packer or importer',
        description:
          'No name or address of the manufacturer, packer or importer is declared anywhere on the label.',
        severity: 'CRITICAL',
        suggestedAction:
          'Direct the manufacturer or packer to print the full legal name and complete postal address, including PIN code, on the principal display panel or an adjacent panel.',
      };
    }

    const address = assessAddress(field.value);
    if (address && !address.looksLikePostalAddress) {
      return {
        ruleCode: 'LM-PCR-6(1)(a)',
        ruleTitle: 'Name and address of manufacturer, packer or importer',
        description: `A name is printed ("${truncate(field.value, 90)}") but it does not amount to a complete address — no PIN code${
          address.hasStreetToken ? '' : ', no street or locality detail'
        } was found. A brand or company name alone does not satisfy Rule 6(1)(a).`,
        severity: 'MODERATE',
        suggestedAction:
          'Require the complete postal address (premises, street or locality, city, state and PIN code) to be added alongside the name.',
      };
    }

    return null;
  },
};

/**
 * Rule 6(1)(f) — consumer care details.
 *
 * A name or designation is not enough on its own: the officer needs a channel a
 * consumer can actually use, so the clause insists on a phone number or an email
 * address as well.
 */
export const rule6_1_f_consumerCare: RuleClause = {
  code: 'LM-PCR-6(1)(f)',
  title: 'Consumer care details',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(f): the package shall carry the name, address, telephone number and email address of the person who can be contacted in case of consumer complaints.',
  weight: 11,
  evaluate: (ctx) => {
    const field = ctx.extraction.consumer_care;

    if (!field.present || !field.value) {
      return {
        ruleCode: 'LM-PCR-6(1)(f)',
        ruleTitle: 'Consumer care details',
        description: 'No consumer care contact details are declared on the label.',
        severity: 'MODERATE',
        suggestedAction:
          'Require consumer care details — a contact name or designation together with a telephone number and an email address — to be printed on the package.',
      };
    }

    const phone = hasPhoneNumber(field.value);
    const email = hasEmail(field.value);

    if (!phone && !email) {
      return {
        ruleCode: 'LM-PCR-6(1)(f)',
        ruleTitle: 'Consumer care details',
        description: `Consumer care text is printed ("${truncate(field.value, 80)}") but it contains neither a usable telephone number nor an email address, so a consumer has no way to raise a complaint.`,
        severity: 'MODERATE',
        suggestedAction: 'Require a working telephone number and email address to be added to the consumer care block.',
      };
    }

    if (!phone || !email) {
      return {
        ruleCode: 'LM-PCR-6(1)(f)',
        ruleTitle: 'Consumer care details',
        description: `Consumer care details are incomplete — ${
          phone ? 'a telephone number is printed but no email address' : 'an email address is printed but no telephone number'
        }.`,
        severity: 'MINOR',
        suggestedAction: `Require the missing ${phone ? 'email address' : 'telephone number'} to be added to the consumer care block.`,
      };
    }

    return null;
  },
};
