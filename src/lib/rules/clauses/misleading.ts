import { DECLARATION_KEYS, type DeclarationKey } from '@/lib/extraction/schema';
import { DECLARATION_LABEL_INLINE } from '@/lib/labels';

import { truncate } from '../format';
import { parseMfgDate, parseNetQuantity, parsePrice, parseReferenceUnit } from '../parsers';
import type { RuleClause, RuleContext, ViolationFinding } from '../types';

/**
 * Rule 6(1) — declarations must not be misleading.
 *
 * The other clauses answer "is the declaration there, and is it in the prescribed
 * form". This one answers a different question: "does the label contradict itself".
 * A declaration can be present, legible and correctly formatted and still mislead —
 * two different maximum retail prices printed on one pack is the classic example, and
 * it is precisely the defect that lets a retailer charge the higher figure while
 * pointing at the lower one if challenged.
 *
 * Only inconsistencies **internal to the label** are tested, and that boundary is
 * deliberate. Whether the pack really contains 500 g, or whether a health claim is
 * deceptive, cannot be established from a photograph — asserting it would produce a
 * finding the officer could not defend. What *can* be established is arithmetic and
 * self-consistency, and both are checkable without leaving the evidence.
 *
 * Two tests:
 *
 *   A. **Conflicting duplicates.** The extractor records a declaration that appears
 *      twice with differing values as both values separated by a pipe. Crucially, the
 *      two sides are compared *as parsed values*, not as strings, and only for the
 *      declarations where a second value genuinely conflicts.
 *
 *   B. **Unit price reconciliation.** Where the MRP, the net quantity and a unit sale
 *      price with a named reference unit are all readable, the unit price is arithmetic:
 *      MRP ÷ net quantity × reference amount. A declared figure that disagrees
 *      materially misstates the value of the pack, which is the entire purpose of
 *      requiring a unit price.
 */

/** How the extractor separates two readings of the same declaration. */
const CONTRADICTION_MARKER = '|';

/**
 * Tolerance on the unit price check. Rounding a computed unit price to something
 * printable is legitimate — Rs. 66.67 per kg becomes "Rs. 67 per kg" — so only a
 * material divergence is reported. Ten percent is comfortably wider than any rounding
 * and narrower than a genuine misstatement.
 */
const UNIT_PRICE_TOLERANCE = 0.1;

/** Below this the arithmetic is too small for a percentage test to mean anything. */
const MIN_COMPARABLE_PRICE = 1;

// ---------------------------------------------------------------------------
// Test A — conflicting duplicates
// ---------------------------------------------------------------------------

/** Returns true when two readings of one declaration genuinely disagree. */
type ConflictTest = (a: string, b: string) => boolean;

const priceConflict: ConflictTest = (a, b) => {
  const left = parsePrice(a);
  const right = parsePrice(b);
  if (left?.amount == null || right?.amount == null) return false;
  return Math.abs(left.amount - right.amount) > 0.005;
};

const quantityConflict: ConflictTest = (a, b) => {
  const left = parseNetQuantity(a);
  const right = parseNetQuantity(b);
  if (left?.baseAmount != null && right?.baseAmount != null) {
    return Math.abs(left.baseAmount - right.baseAmount) > 0.001;
  }
  if (left?.amount != null && right?.amount != null) {
    return Math.abs(left.amount - right.amount) > 0.001;
  }
  return false;
};

const dateConflict: ConflictTest = (a, b) => {
  const left = parseMfgDate(a);
  const right = parseMfgDate(b);
  if (!left || !right) return false;
  if (left.hasMonthAndYear && right.hasMonthAndYear) {
    return left.month !== right.month || left.year !== right.year;
  }
  if (left.year !== null && right.year !== null) return left.year !== right.year;
  return false;
};

const textConflict: ConflictTest = (a, b) => {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return false;
  // One containing the other is an elaboration ("India" vs "Made in India"), not a
  // conflict.
  return !left.includes(right) && !right.includes(left);
};

/**
 * Which declarations a second differing value actually contradicts.
 *
 * `manufacturer_name_address` and `consumer_care` are deliberately absent. A pack may
 * legitimately name both a manufacturer and a packer, and a consumer care block
 * routinely lists an email *and* a telephone number — complementary halves of one
 * declaration rather than rival values. An earlier version of this clause compared raw
 * strings across every field and duly flagged the fully compliant archetype, whose
 * consumer care reads "care@…in | 1800-233-1188", as self-contradictory. Comparing
 * parsed values for a restricted set of fields is what makes the test mean something.
 */
const CONFLICT_TESTS: Partial<Record<DeclarationKey, ConflictTest>> = {
  mrp: priceConflict,
  unit_sale_price: priceConflict,
  net_quantity: quantityConflict,
  mfg_date: dateConflict,
  country_of_origin: textConflict,
};

interface Contradiction {
  label: string;
  values: string[];
}

function contradictions(ctx: RuleContext): Contradiction[] {
  const found: Contradiction[] = [];

  for (const key of DECLARATION_KEYS) {
    const conflicts = CONFLICT_TESTS[key];
    if (!conflicts) continue;

    const field = ctx.extraction[key];
    if (!field.present || !field.value || !field.value.includes(CONTRADICTION_MARKER)) continue;

    const values = field.value
      .split(CONTRADICTION_MARKER)
      .map((part) => part.trim())
      .filter(Boolean);
    if (values.length < 2) continue;

    const anyConflict = values.some((value, index) =>
      values.slice(index + 1).some((other) => conflicts(value, other)),
    );
    if (anyConflict) found.push({ label: DECLARATION_LABEL_INLINE[key], values });
  }

  return found;
}

// ---------------------------------------------------------------------------
// Test B — unit price reconciliation
// ---------------------------------------------------------------------------

interface UnitPriceMismatch {
  declared: number;
  implied: number;
  reference: string;
  netQuantity: string;
  mrp: number;
}

function unitPriceMismatch(ctx: RuleContext): UnitPriceMismatch | null {
  const mrp = ctx.mrp;
  const usp = ctx.unitSalePrice;
  const quantity = ctx.netQuantity;

  if (!mrp?.amount || !usp?.amount || !quantity?.baseAmount) return null;
  if (mrp.amount < MIN_COMPARABLE_PRICE || usp.amount < MIN_COMPARABLE_PRICE) return null;

  const reference = parseReferenceUnit(usp.perUnit);
  if (!reference) return null;

  // A unit price quoted "per kg" against a net quantity in millilitres is not a
  // mismatch to be measured — the two are incommensurable, and the net quantity clause
  // already deals with an unusable unit. Staying silent avoids stacking a nonsense
  // arithmetic finding on top of a real one.
  if (reference.kind !== quantity.kind) return null;

  const implied = (mrp.amount / quantity.baseAmount) * reference.baseAmount;
  if (!Number.isFinite(implied) || implied <= 0) return null;

  const divergence = Math.abs(usp.amount - implied) / implied;
  if (divergence <= UNIT_PRICE_TOLERANCE) return null;

  return {
    declared: usp.amount,
    implied,
    reference: usp.perUnit ?? reference.canonicalUnit,
    netQuantity: quantity.raw.trim(),
    mrp: mrp.amount,
  };
}

const money = (value: number): string =>
  `Rs. ${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;

// ---------------------------------------------------------------------------

export const rule6_1_misleadingDeclaration: RuleClause = {
  code: 'LM-PCR-6(1)-MISLEADING',
  title: 'Declarations must not be misleading',
  reference:
    'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1), read with Section 18(1) of the Legal Metrology Act, 2009: a pre-packaged commodity shall bear the prescribed declarations in the prescribed manner. A declaration stated twice with conflicting values, or a unit sale price that does not reconcile with the declared price and net quantity, is not a valid declaration.',
  weight: 6,
  // Needs something to be internally consistent about. Where nothing was read, the
  // honest outcome is "not assessed" rather than a free pass.
  appliesTo: (ctx) => DECLARATION_KEYS.some((key) => ctx.extraction[key].present),
  evaluate: (ctx): ViolationFinding | null => {
    // ---- Test A: the label contradicts itself ----
    const conflicting = contradictions(ctx);
    if (conflicting.length > 0) {
      const described = conflicting
        .map(
          (entry) =>
            `${entry.label} (${entry.values.map((value) => `"${truncate(value, 40)}"`).join(' and ')})`,
        )
        .join('; ');

      // A dual price or a dual quantity is what a consumer is actually overcharged
      // against, so it is graded above a conflicting origin declaration.
      const isCommercial = conflicting.some((entry) =>
        /retail sale price|net quantity|unit sale price/i.test(entry.label),
      );

      return {
        ruleCode: 'LM-PCR-6(1)-MISLEADING',
        ruleTitle: 'Declarations must not be misleading',
        description:
          `The label states the same mandatory declaration more than once with conflicting values: ${described}. ` +
          `A consumer cannot tell which declaration governs${
            isCommercial ? ', and the higher figure can be charged while the lower one is displayed' : ''
          }.`,
        severity: isCommercial ? 'MODERATE' : 'MINOR',
        suggestedAction:
          'Verify both declarations on the physical package and photograph each. Require the artwork to carry a single unambiguous value before further sale.',
      };
    }

    // ---- Test B: the unit price does not follow from the price and quantity ----
    const mismatch = unitPriceMismatch(ctx);
    if (mismatch) {
      const direction = mismatch.declared < mismatch.implied ? 'understates' : 'overstates';

      return {
        ruleCode: 'LM-PCR-6(1)-MISLEADING',
        ruleTitle: 'Declarations must not be misleading',
        description:
          'The declared unit sale price does not reconcile with the price and net quantity printed on the pack. ' +
          `At ${money(mismatch.mrp)} for ${mismatch.netQuantity}, the unit price works out to about ` +
          `${money(mismatch.implied)} per ${mismatch.reference}, but the label declares ` +
          `${money(mismatch.declared)} per ${mismatch.reference} — which ${direction} the true cost to the consumer.`,
        severity: 'MODERATE',
        suggestedAction:
          'Re-measure the net quantity and confirm the MRP on the physical package, then require the unit sale price to be corrected to agree with them.',
      };
    }

    return null;
  },
};
