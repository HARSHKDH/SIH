import type { LabelExtraction } from '@/lib/extraction/schema';

import { detectImportSignals, parseMfgDate, parseNetQuantity, parsePrice } from './parsers';
import { RULE_CLAUSES } from './registry';
import {
  SEVERITY_ORDER,
  type ClauseOutcome,
  type ComplianceResult,
  type RuleContext,
  type RuleSeverity,
  type ViolationFinding,
} from './types';

/**
 * Turns a raw extraction into the parsed, read-only context every clause shares.
 */
export function buildRuleContext(
  extraction: LabelExtraction,
  productName?: string | null,
): RuleContext {
  return {
    extraction,
    productName: productName?.trim() || null,
    netQuantity: parseNetQuantity(extraction.net_quantity.value),
    mrp: parsePrice(extraction.mrp.value),
    unitSalePrice: parsePrice(extraction.unit_sale_price.value),
    mfgDate: parseMfgDate(extraction.mfg_date.value),
    importSignals: detectImportSignals({
      manufacturerAddress: extraction.manufacturer_name_address.value,
      countryOfOrigin: extraction.country_of_origin.value,
      detectedLanguages: extraction.image_assessment.detected_languages,
      productName: productName?.trim() || null,
    }),
    evaluatedAt: new Date(),
  };
}

/**
 * Runs every clause and scores the result.
 *
 * Scoring is a straight weighted deduction over the clauses that actually apply:
 *
 *     score = 100 × (applicableWeight − lostWeight) / applicableWeight
 *
 * Two properties matter. First, clauses that could not be assessed (no panel-area
 * estimate, no price to check tax wording on) are excluded from the denominator
 * rather than counted as passes, so the score never flatters a label by accident.
 * Second, every point is attributable — `outcomes` carries the per-clause detail
 * that the PDF report prints, which is what makes a score defensible if the
 * finding is contested.
 */
export function evaluateCompliance(
  extraction: LabelExtraction,
  productName?: string | null,
): ComplianceResult {
  const ctx = buildRuleContext(extraction, productName);

  const outcomes: ClauseOutcome[] = RULE_CLAUSES.map((clause) => {
    const applicable = clause.appliesTo ? clause.appliesTo(ctx) : true;
    if (!applicable) {
      return {
        code: clause.code,
        title: clause.title,
        reference: clause.reference,
        weight: clause.weight,
        applicable: false,
        passed: false,
        finding: null,
      };
    }

    const finding = clause.evaluate(ctx);
    return {
      code: clause.code,
      title: clause.title,
      reference: clause.reference,
      weight: clause.weight,
      applicable: true,
      passed: finding === null,
      finding,
    };
  });

  const applicableOutcomes = outcomes.filter((o) => o.applicable);
  const failedOutcomes = applicableOutcomes.filter((o) => !o.passed);

  const applicableWeight = applicableOutcomes.reduce((sum, o) => sum + o.weight, 0);
  const lostWeight = failedOutcomes.reduce((sum, o) => sum + o.weight, 0);

  // No applicable clause is a degenerate case (an extraction with nothing to go
  // on). Reporting 0 rather than 100 keeps the failure visible.
  const score =
    applicableWeight === 0
      ? 0
      : clamp(Math.round((100 * (applicableWeight - lostWeight)) / applicableWeight), 0, 100);

  const violations = failedOutcomes
    .map((o) => o.finding)
    .filter((f): f is ViolationFinding => f !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const countBySeverity = (severity: RuleSeverity) =>
    violations.filter((v) => v.severity === severity).length;

  return {
    violations,
    score,
    breakdown: {
      score,
      applicableWeight,
      lostWeight,
      clausesEvaluated: outcomes.length,
      clausesApplicable: applicableOutcomes.length,
      clausesFailed: failedOutcomes.length,
      criticalCount: countBySeverity('CRITICAL'),
      moderateCount: countBySeverity('MODERATE'),
      minorCount: countBySeverity('MINOR'),
    },
    outcomes,
  };
}

// ---------------------------------------------------------------------------
// Input suitability
// ---------------------------------------------------------------------------

export interface SuitabilityVerdict {
  suitable: boolean;
  /** Officer-facing explanation when the image cannot be adjudicated. */
  reason?: string;
}

/**
 * Decides whether an extraction is worth running rules against at all.
 *
 * A blurry photo would otherwise produce a page of "declaration missing"
 * violations that say nothing about the package — a false accusation dressed up
 * as a finding. Better to fail the scan and ask for a clearer photo.
 */
export function assessInputSuitability(extraction: LabelExtraction): SuitabilityVerdict {
  const assessment = extraction.image_assessment;

  if (!assessment.is_packaged_commodity_label) {
    return {
      suitable: false,
      reason:
        'This image does not appear to show a pre-packaged commodity label, so no compliance assessment was made. Please photograph the label panel directly.',
    };
  }

  if (!assessment.readable) {
    const issues = assessment.issues.length > 0 ? ` Reported problems: ${assessment.issues.join('; ')}.` : '';
    return {
      suitable: false,
      reason: `The label could not be read reliably from this photograph, so no compliance assessment was made.${issues} Re-take the photo square-on, in even light, with the whole panel in frame.`,
    };
  }

  return { suitable: true };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export type ComplianceBand = 'COMPLIANT' | 'MINOR_ISSUES' | 'NON_COMPLIANT' | 'SERIOUS';

export interface BandInput {
  score: number;
  criticalCount: number;
  moderateCount: number;
  minorCount: number;
}

/**
 * Bands the numeric score for display.
 *
 * Severity leads, the number follows. A package with any critical violation can
 * never read as "compliant" no matter how well it scores elsewhere — a missing
 * MRP is not offset by tidy typography. Equally, "Compliant" requires *zero*
 * findings, so the badge on the scan detail screen can never contradict the
 * violations listed directly beneath it.
 */
export function complianceBand(input: BandInput): ComplianceBand {
  const { score, criticalCount, moderateCount, minorCount } = input;

  if (criticalCount > 0) return score < 60 ? 'SERIOUS' : 'NON_COMPLIANT';
  if (moderateCount > 0) return score < 50 ? 'SERIOUS' : 'NON_COMPLIANT';
  if (minorCount > 0) return score >= 85 ? 'MINOR_ISSUES' : 'NON_COMPLIANT';
  return 'COMPLIANT';
}

/** Convenience overload for callers that only hold a `ComplianceScoreBreakdown`. */
export function bandFromBreakdown(breakdown: {
  score: number;
  criticalCount: number;
  moderateCount: number;
  minorCount: number;
}): ComplianceBand {
  return complianceBand(breakdown);
}

/**
 * Bands an *average* score.
 *
 * `complianceBand` leads with severity, which is right for a single package but wrong
 * for an aggregate: an officer whose scans average 85 has not committed a moderate
 * violation, so colouring that figure brick red would misrepresent it. Averages are
 * banded on the number alone.
 */
export function bandForAverageScore(score: number): ComplianceBand {
  if (score >= 90) return 'COMPLIANT';
  if (score >= 70) return 'MINOR_ISSUES';
  if (score >= 50) return 'NON_COMPLIANT';
  return 'SERIOUS';
}

export const COMPLIANCE_BAND_LABEL: Record<ComplianceBand, string> = {
  COMPLIANT: 'Compliant',
  MINOR_ISSUES: 'Minor issues',
  NON_COMPLIANT: 'Non-compliant',
  SERIOUS: 'Seriously non-compliant',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
