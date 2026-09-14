/**
 * Clause-level tests for the rule engine.
 *
 *   npm test
 *
 * Uses Node's built-in test runner rather than a framework: no new dependency, and the
 * project already runs TypeScript directly through tsx.
 *
 * These are the tests that matter most in this codebase. The vision model's output is
 * validated by schema and reviewed by a human, but the *findings* are what appear in an
 * enforcement record, and each one comes from a pure function with a small, enumerable
 * set of outcomes. Every clause is therefore checked on three paths — it fires, it
 * passes, and where relevant it abstains — because "not assessed" is a distinct and
 * deliberate third outcome that keeps a score from flattering a label by accident.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mockArchetypeByName } from '@/lib/extraction/mock';
import type {
  BoundingBox,
  DeclarationField,
  DeclarationKey,
  ImageAssessment,
  LabelExtraction,
  RelativeTextSizes,
} from '@/lib/extraction/schema';

import { rule6_1_d_manufactureDate } from './clauses/dates';
import { rule6_1_a_manufacturerAddress, rule6_1_f_consumerCare } from './clauses/identity';
import {
  rule9_1_legibility,
  rule9_2_minimumLetterHeight,
  rule9_3_netQuantityNumeralHeight,
} from './clauses/legibility';
import { rule6_1_misleadingDeclaration } from './clauses/misleading';
import { rule6_1_countryOfOrigin } from './clauses/origin';
import { rule6_2_declarationsGrouped } from './clauses/placement';
import {
  rule6_1_e_retailSalePrice,
  rule6_1_e_taxInclusiveWording,
  rule6_1_unitSalePrice,
} from './clauses/price';
import { rule6_1_c_netQuantity, rule8_netQuantityUnits } from './clauses/quantity';
import {
  assessInputSuitability,
  buildRuleContext,
  complianceBand,
  evaluateCompliance,
} from './engine';
import {
  assessAddress,
  parseMfgDate,
  parseNetQuantity,
  parsePrice,
  parseReferenceUnit,
} from './parsers';
import { RULE_CLAUSES, TOTAL_RULE_WEIGHT } from './registry';
import type { RuleClause, ViolationFinding } from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A declaration that is present, with optional geometry and size. */
function decl(
  value: string,
  options: { box?: BoundingBox; mm?: number | null; confidence?: number } = {},
): DeclarationField {
  return {
    present: true,
    value,
    confidence: options.confidence ?? 0.95,
    bounding_box: options.box ?? null,
    font_size_mm_est: options.mm ?? null,
    notes: null,
  };
}

const absent: DeclarationField = {
  present: false,
  value: null,
  confidence: 0,
  bounding_box: null,
  font_size_mm_est: null,
  notes: null,
};

type Overrides = Partial<Record<DeclarationKey, DeclarationField>> & {
  relative_text_sizes?: Partial<RelativeTextSizes>;
  image_assessment?: Partial<ImageAssessment>;
};

/**
 * Builds a label from the fully compliant archetype plus overrides.
 *
 * Starting from a known-good label rather than an empty one means a test changes exactly
 * one thing, so a failure localises to the clause under test instead of to whichever
 * field the fixture happened to omit.
 */
function label(overrides: Overrides = {}): LabelExtraction {
  const base = mockArchetypeByName('compliant-retail-pouch');
  assert.ok(base, 'the compliant archetype must exist');

  const { relative_text_sizes, image_assessment, ...declarations } = overrides;

  return {
    ...base,
    ...declarations,
    relative_text_sizes: { ...base.relative_text_sizes, ...relative_text_sizes },
    image_assessment: { ...base.image_assessment, ...image_assessment },
  };
}

/** `null` means the clause passed; `'abstained'` means it declined to judge. */
function run(clause: RuleClause, extraction: LabelExtraction) {
  const ctx = buildRuleContext(extraction, null);
  if (clause.appliesTo && !clause.appliesTo(ctx)) return 'abstained' as const;
  return clause.evaluate(ctx);
}

/**
 * Narrowing is done with `assert.fail`, which is typed as returning `never`, rather than
 * with `assert.ok`/`assert.notEqual`. Those are not type guards, so the union would
 * survive into the caller and every `finding.severity` below would fail to compile.
 */
function expectFinding(clause: RuleClause, extraction: LabelExtraction): ViolationFinding {
  const result = run(clause, extraction);

  if (result === 'abstained') {
    assert.fail(`${clause.code} abstained but a finding was expected`);
  }
  if (result === null) {
    assert.fail(`${clause.code} passed but a finding was expected`);
  }

  assert.equal(result.ruleCode, clause.code);
  assert.ok(result.description.length > 20, 'a finding must explain itself');
  assert.ok(result.suggestedAction.length > 20, 'a finding must say what to do');
  return result;
}

function expectPass(clause: RuleClause, extraction: LabelExtraction) {
  assert.equal(run(clause, extraction), null, `${clause.code} raised an unexpected finding`);
}

function expectAbstain(clause: RuleClause, extraction: LabelExtraction) {
  assert.equal(run(clause, extraction), 'abstained', `${clause.code} did not abstain`);
}

// ---------------------------------------------------------------------------
// The rule book itself
// ---------------------------------------------------------------------------

describe('rule book', () => {
  it('registers 14 clauses totalling 121 weight', () => {
    assert.equal(RULE_CLAUSES.length, 14);
    assert.equal(TOTAL_RULE_WEIGHT, 121);
  });

  it('gives every clause a unique code, a statutory reference and a positive weight', () => {
    const codes = new Set<string>();
    for (const clause of RULE_CLAUSES) {
      assert.ok(!codes.has(clause.code), `duplicate clause code ${clause.code}`);
      codes.add(clause.code);
      assert.ok(clause.weight > 0, `${clause.code} must carry weight`);
      assert.match(clause.reference, /Legal Metrology/, `${clause.code} must cite the rules`);
    }
  });

  it('scores a fully compliant label at 100 with no violations', () => {
    const result = evaluateCompliance(label());
    assert.equal(result.score, 100);
    assert.deepEqual(result.violations, []);
    assert.equal(complianceBand(result.breakdown), 'COMPLIANT');
  });
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe('scoring', () => {
  it('excludes clauses that could not be assessed from the denominator', () => {
    // A pack sold by number makes the unit-sale-price clause inapplicable, so the
    // denominator must shrink rather than the clause counting as a pass.
    const byNumber = evaluateCompliance(label({ net_quantity: decl('20 N', { mm: 4 }) }));
    assert.ok(
      byNumber.breakdown.applicableWeight < TOTAL_RULE_WEIGHT,
      'an inapplicable clause must leave the denominator',
    );
    assert.ok(byNumber.breakdown.clausesApplicable < byNumber.breakdown.clausesEvaluated);
  });

  it('derives the score from applicable and lost weight', () => {
    const result = evaluateCompliance(label({ mrp: absent }));
    const { applicableWeight, lostWeight } = result.breakdown;
    const expected = Math.round((100 * (applicableWeight - lostWeight)) / applicableWeight);
    assert.equal(result.score, expected);
  });

  it('reports an outcome for every clause, including the passes', () => {
    const result = evaluateCompliance(label());
    assert.equal(result.outcomes.length, RULE_CLAUSES.length);
    assert.ok(result.outcomes.every((outcome) => outcome.code && outcome.reference));
  });

  it('never lets a critical finding read as compliant', () => {
    const band = complianceBand({ score: 97, criticalCount: 1, moderateCount: 0, minorCount: 0 });
    assert.notEqual(band, 'COMPLIANT');
  });

  it('requires zero findings for COMPLIANT, so the badge cannot contradict the list', () => {
    const band = complianceBand({ score: 99, criticalCount: 0, moderateCount: 0, minorCount: 1 });
    assert.notEqual(band, 'COMPLIANT');
  });
});

// ---------------------------------------------------------------------------
// Suitability gate
// ---------------------------------------------------------------------------

describe('input suitability', () => {
  it('accepts a readable packaged-commodity label', () => {
    assert.equal(assessInputSuitability(label()).suitable, true);
  });

  it('refuses an image that is not a packaged commodity label', () => {
    const verdict = assessInputSuitability(
      label({ image_assessment: { is_packaged_commodity_label: false } }),
    );
    assert.equal(verdict.suitable, false);
    assert.match(verdict.reason ?? '', /not appear to show a pre-packaged/i);
  });

  it('refuses an unreadable photograph and repeats the reported problems', () => {
    const verdict = assessInputSuitability(
      label({ image_assessment: { readable: false, issues: ['heavy glare'] } }),
    );
    assert.equal(verdict.suitable, false);
    assert.match(verdict.reason ?? '', /heavy glare/);
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1)(a) — manufacturer name and address
// ---------------------------------------------------------------------------

describe('Rule 6(1)(a) manufacturer name and address', () => {
  it('fires CRITICAL when absent', () => {
    const finding = expectFinding(rule6_1_a_manufacturerAddress, label({ manufacturer_name_address: absent }));
    assert.equal(finding.severity, 'CRITICAL');
  });

  it('fires when a brand name is printed with no address', () => {
    const finding = expectFinding(
      rule6_1_a_manufacturerAddress,
      label({ manufacturer_name_address: decl('Sundar Foods') }),
    );
    assert.equal(finding.severity, 'MODERATE');
  });

  it('passes on a complete postal address', () => {
    expectPass(rule6_1_a_manufacturerAddress, label());
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1)(c) and Rule 8 — net quantity
// ---------------------------------------------------------------------------

describe('Rule 6(1)(c) net quantity', () => {
  it('fires CRITICAL when absent', () => {
    const finding = expectFinding(rule6_1_c_netQuantity, label({ net_quantity: absent }));
    assert.equal(finding.severity, 'CRITICAL');
  });

  it('fires when a numeral carries no unit of measure', () => {
    const finding = expectFinding(rule6_1_c_netQuantity, label({ net_quantity: decl('Net Qty: 12') }));
    assert.equal(finding.severity, 'CRITICAL');
    assert.match(finding.description, /unit/i);
  });

  it('passes on a metric declaration', () => {
    expectPass(rule6_1_c_netQuantity, label());
  });
});

describe('Rule 8 prescribed units', () => {
  it('fires on a non-metric unit', () => {
    expectFinding(rule8_netQuantityUnits, label({ net_quantity: decl('Net Wt. 16 oz') }));
  });

  it('passes on grams', () => {
    expectPass(rule8_netQuantityUnits, label());
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1)(e) — price
// ---------------------------------------------------------------------------

describe('Rule 6(1)(e) retail sale price', () => {
  it('fires CRITICAL when absent', () => {
    const finding = expectFinding(rule6_1_e_retailSalePrice, label({ mrp: absent }));
    assert.equal(finding.severity, 'CRITICAL');
  });

  it('fires when no currency is indicated', () => {
    const finding = expectFinding(rule6_1_e_retailSalePrice, label({ mrp: decl('185.00') }));
    assert.equal(finding.severity, 'MODERATE');
  });

  it('passes on a rupee-marked price', () => {
    expectPass(rule6_1_e_retailSalePrice, label());
  });
});

describe('Rule 6(1)(e) inclusive-of-taxes wording', () => {
  it('fires when the wording is missing', () => {
    const finding = expectFinding(
      rule6_1_e_taxInclusiveWording,
      label({ mrp: decl('MRP Rs. 185.00') }),
    );
    assert.equal(finding.severity, 'MINOR');
  });

  it('passes when the wording is present', () => {
    expectPass(rule6_1_e_taxInclusiveWording, label());
  });

  it('abstains when there is no price to qualify', () => {
    expectAbstain(rule6_1_e_taxInclusiveWording, label({ mrp: absent }));
  });
});

describe('Rule 6(1) unit sale price', () => {
  it('fires when a commodity sold by weight declares none', () => {
    const finding = expectFinding(rule6_1_unitSalePrice, label({ unit_sale_price: absent }));
    assert.equal(finding.severity, 'MINOR');
  });

  it('fires when the figure names no reference unit', () => {
    expectFinding(rule6_1_unitSalePrice, label({ unit_sale_price: decl('Rs. 370') }));
  });

  it('abstains for a commodity sold by number, where a unit price is meaningless', () => {
    expectAbstain(
      rule6_1_unitSalePrice,
      label({ net_quantity: decl('20 N', { mm: 4 }), unit_sale_price: absent }),
    );
  });

  it('passes when a per-unit price is declared', () => {
    expectPass(rule6_1_unitSalePrice, label());
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1)(d) — date
// ---------------------------------------------------------------------------

describe('Rule 6(1)(d) month and year', () => {
  it('fires when absent', () => {
    expectFinding(rule6_1_d_manufactureDate, label({ mfg_date: absent }));
  });

  it('fires when only a year is printed', () => {
    expectFinding(rule6_1_d_manufactureDate, label({ mfg_date: decl('MFD 2026') }));
  });

  it('passes on month and year', () => {
    expectPass(rule6_1_d_manufactureDate, label());
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1)(f) — consumer care
// ---------------------------------------------------------------------------

describe('Rule 6(1)(f) consumer care', () => {
  it('fires MODERATE when absent', () => {
    const finding = expectFinding(rule6_1_f_consumerCare, label({ consumer_care: absent }));
    assert.equal(finding.severity, 'MODERATE');
  });

  it('fires MINOR when only an email is given', () => {
    const finding = expectFinding(
      rule6_1_f_consumerCare,
      label({ consumer_care: decl('Consumer Care: care@sundarfoods.in') }),
    );
    assert.equal(finding.severity, 'MINOR');
  });

  it('passes with both an email and a telephone number', () => {
    expectPass(rule6_1_f_consumerCare, label());
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1) — country of origin
// ---------------------------------------------------------------------------

describe('Rule 6(1) country of origin', () => {
  it('grades a missing declaration higher when the label looks imported', () => {
    const finding = expectFinding(
      rule6_1_countryOfOrigin,
      label({
        country_of_origin: absent,
        manufacturer_name_address: decl('Imported by Nordic Foods AS, Oslo, Norway'),
      }),
    );
    assert.equal(finding.severity, 'MODERATE');
  });

  it('grades it lower when there is no evidence of import', () => {
    const finding = expectFinding(rule6_1_countryOfOrigin, label({ country_of_origin: absent }));
    assert.equal(finding.severity, 'MINOR');
  });

  it('passes when declared', () => {
    expectPass(rule6_1_countryOfOrigin, label());
  });
});

// ---------------------------------------------------------------------------
// Rule 6(1) — misleading declarations
// ---------------------------------------------------------------------------

describe('Rule 6(1) misleading declarations', () => {
  it('fires MODERATE on two different retail sale prices', () => {
    const finding = expectFinding(
      rule6_1_misleadingDeclaration,
      label({ mrp: decl('MRP Rs. 185.00 (inclusive of all taxes) | MRP Rs. 199.00') }),
    );
    assert.equal(finding.severity, 'MODERATE');
    assert.match(finding.description, /conflicting/i);
  });

  it('fires on two different net quantities', () => {
    const finding = expectFinding(
      rule6_1_misleadingDeclaration,
      label({ net_quantity: decl('Net Qty: 500 g | Net Qty: 450 g', { mm: 4 }) }),
    );
    assert.equal(finding.severity, 'MODERATE');
  });

  it('fires on two different dates of manufacture', () => {
    const finding = expectFinding(
      rule6_1_misleadingDeclaration,
      label({ mfg_date: decl('MFD: 02/2026 | MFD: 11/2025') }),
    );
    assert.equal(finding.severity, 'MINOR');
  });

  it('treats the same value printed twice as compliant, not contradictory', () => {
    expectPass(
      rule6_1_misleadingDeclaration,
      label({ mrp: decl('MRP Rs. 185.00 (inclusive of all taxes) | MRP Rs. 185/-') }),
    );
  });

  /*
   * Regression test. An earlier version compared raw strings across every declaration
   * and flagged the fully compliant archetype, whose consumer care reads
   * "care@…in | 1800-233-1188", as self-contradictory. An email and a telephone number
   * are complementary halves of one declaration, not rival values.
   */
  it('does not mistake an email and phone separated by a pipe for a contradiction', () => {
    expectPass(
      rule6_1_misleadingDeclaration,
      label({ consumer_care: decl('Consumer Care: care@x.in | 1800-233-1188') }),
    );
  });

  it('does not mistake two named manufacturers for a contradiction', () => {
    expectPass(
      rule6_1_misleadingDeclaration,
      label({
        manufacturer_name_address: decl(
          'Mfd by A Foods, Plot 4, Pune 411026 | Packed by B Packers, Plot 9, Pune 411027',
        ),
      }),
    );
  });

  it('treats an elaborated country of origin as consistent', () => {
    expectPass(
      rule6_1_misleadingDeclaration,
      label({ country_of_origin: decl('India | Made in India') }),
    );
  });

  it('fires when the unit sale price does not reconcile with price and quantity', () => {
    // Rs. 185 for 500 g is Rs. 370 per kg. Declaring Rs. 250 per kg understates it.
    const finding = expectFinding(
      rule6_1_misleadingDeclaration,
      label({ unit_sale_price: decl('Unit Sale Price: Rs. 250 per kg') }),
    );
    assert.equal(finding.severity, 'MODERATE');
    assert.match(finding.description, /understates/);
  });

  it('accepts a unit price that reconciles, including rounding', () => {
    // The archetype declares Rs. 370 per kg against Rs. 185 for 500 g — exact.
    expectPass(rule6_1_misleadingDeclaration, label());
    // Rounded to a printable figure, still within tolerance.
    expectPass(
      rule6_1_misleadingDeclaration,
      label({ unit_sale_price: decl('Rs. 375 per kg') }),
    );
  });

  it('stays silent when the unit price and net quantity are incommensurable', () => {
    // "per kg" against a volume declaration is not an arithmetic error to measure; the
    // net quantity clauses deal with the unusable unit instead.
    expectPass(
      rule6_1_misleadingDeclaration,
      label({
        net_quantity: decl('Net Qty: 750 ml', { mm: 4 }),
        unit_sale_price: decl('Rs. 90 per kg'),
      }),
    );
  });

  it('abstains when nothing was read from the label', () => {
    const blank: Overrides = {};
    for (const key of [
      'manufacturer_name_address',
      'net_quantity',
      'mrp',
      'mfg_date',
      'consumer_care',
      'country_of_origin',
      'unit_sale_price',
    ] as const) {
      blank[key] = absent;
    }
    expectAbstain(rule6_1_misleadingDeclaration, label(blank));
  });
});

// ---------------------------------------------------------------------------
// Rule 6(2) — placement
// ---------------------------------------------------------------------------

describe('Rule 6(2) declarations grouped at one place', () => {
  it('passes on the tidy block of the compliant archetype', () => {
    expectPass(rule6_2_declarationsGrouped, label());
  });

  it('fires when one declaration is stranded away from the others', () => {
    expectFinding(
      rule6_2_declarationsGrouped,
      label({ consumer_care: decl('Care: care@x.in | 1800-1', { box: { x: 0.9, y: 0.03, width: 0.08, height: 0.03 } }) }),
    );
  });

  it('abstains below four located declarations, where there is too little to judge', () => {
    expectAbstain(
      rule6_2_declarationsGrouped,
      label({
        mrp: decl('MRP Rs. 185.00 (inclusive of all taxes)'),
        mfg_date: decl('MFD: 02/2026'),
        consumer_care: decl('Care: care@x.in | 1800-1'),
        country_of_origin: decl('India'),
        unit_sale_price: decl('Rs. 370 per kg'),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — legibility
// ---------------------------------------------------------------------------

describe('Rule 9 legibility', () => {
  it('9(1) fires when the smallest declaration is judged illegible', () => {
    const finding = expectFinding(
      rule9_1_legibility,
      label({ relative_text_sizes: { smallest_appears_illegible: true } }),
    );
    assert.equal(finding.severity, 'MODERATE');
  });

  it('9(1) passes when legible', () => {
    expectPass(rule9_1_legibility, label());
  });

  it('9(2) fires below the 1 mm floor and names the offending declaration', () => {
    const finding = expectFinding(
      rule9_2_minimumLetterHeight,
      label({ consumer_care: decl('Care: care@x.in | 1800-1', { mm: 0.6 }) }),
    );
    assert.match(finding.description, /consumer care/i);
  });

  it('9(2) passes when every measured declaration clears 1 mm', () => {
    expectPass(rule9_2_minimumLetterHeight, label());
  });

  it('9(2) abstains when no declaration carries a measurement', () => {
    const unmeasured: Overrides = {};
    for (const key of [
      'manufacturer_name_address',
      'net_quantity',
      'mrp',
      'mfg_date',
      'consumer_care',
      'country_of_origin',
      'unit_sale_price',
    ] as const) {
      unmeasured[key] = decl('something', { mm: null });
    }
    expectAbstain(rule9_2_minimumLetterHeight, label(unmeasured));
  });

  it('9(3) fires when the net quantity numeral is too small for the panel', () => {
    expectFinding(
      rule9_3_netQuantityNumeralHeight,
      label({
        net_quantity: decl('Net Qty: 500 g', { mm: 1.2 }),
        relative_text_sizes: { principal_display_panel_area_cm2_est: 600 },
      }),
    );
  });

  it('9(3) passes when the numeral meets the Third Schedule', () => {
    expectPass(rule9_3_netQuantityNumeralHeight, label());
  });

  it('9(3) abstains without both a panel area and a numeral height', () => {
    expectAbstain(
      rule9_3_netQuantityNumeralHeight,
      label({ relative_text_sizes: { principal_display_panel_area_cm2_est: null } }),
    );
  });
});

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

describe('parsers', () => {
  it('reads metric net quantities', () => {
    assert.equal(parseNetQuantity('Net Qty: 500 g')?.baseAmount, 500);
    assert.equal(parseNetQuantity('1 kg')?.baseAmount, 1000);
    assert.equal(parseNetQuantity('Net Qty. 750 ml')?.baseAmount, 750);
    assert.equal(parseNetQuantity('20 N')?.kind, 'number');
  });

  it('flags a numeral with no unit, distinctly from an unparseable value', () => {
    const unitless = parseNetQuantity('Net Qty: 12');
    assert.equal(unitless?.missingUnit, true);
    assert.equal(unitless?.amount, 12);
  });

  it('flags non-metric units', () => {
    assert.equal(parseNetQuantity('Net Wt. 16 oz')?.usesNonMetricUnit, true);
  });

  it('reads prices, currency markers and tax wording', () => {
    const mrp = parsePrice('MRP Rs. 185.00 (inclusive of all taxes)');
    assert.equal(mrp?.amount, 185);
    assert.equal(mrp?.hasCurrencyMarker, true);
    assert.equal(mrp?.statesInclusiveOfTaxes, true);

    const bare = parsePrice('185.00');
    assert.equal(bare?.hasCurrencyMarker, false);
    assert.equal(bare?.statesInclusiveOfTaxes, false);
  });

  it('reads the reference unit of a unit sale price', () => {
    assert.equal(parsePrice('Rs. 370 per kg')?.perUnit, 'kg');
    assert.equal(parseReferenceUnit('kg')?.baseAmount, 1000);
    assert.equal(parseReferenceUnit('100 g')?.baseAmount, 100);
    assert.equal(parseReferenceUnit('litre')?.baseAmount, 1000);
    assert.equal(parseReferenceUnit('nonsense'), null);
  });

  it('reads dates in the formats coders actually print', () => {
    assert.equal(parseMfgDate('MFD: 02/2026')?.hasMonthAndYear, true);
    assert.equal(parseMfgDate('Packed on: 14 JAN 2026')?.month, 1);
    assert.equal(parseMfgDate('2026-03')?.month, 3);
    assert.equal(parseMfgDate('MFD 2026')?.hasMonthAndYear, false);
  });

  it('distinguishes a postal address from a brand name', () => {
    assert.equal(
      assessAddress('Sundar Foods Pvt. Ltd., Plot 44, MIDC Industrial Area, Pune, Maharashtra 411026')
        ?.looksLikePostalAddress,
      true,
    );
    assert.equal(assessAddress('Sundar Foods')?.looksLikePostalAddress, false);
  });
});
