import type { LabelExtraction } from '@/lib/extraction/schema';

import type { ParsedDate, ParsedNetQuantity, ParsedPrice } from './parsers';

export type RuleSeverity = 'CRITICAL' | 'MODERATE' | 'MINOR';

/**
 * Everything a clause function needs, pre-parsed once.
 *
 * Parsing net quantity or MRP inside each clause would mean re-running the same
 * regexes and, worse, letting two clauses disagree about what the label says.
 * The context is built once in `evaluateCompliance` and passed down read-only.
 */
export interface RuleContext {
  readonly extraction: LabelExtraction;
  readonly productName: string | null;
  readonly netQuantity: ParsedNetQuantity | null;
  readonly mrp: ParsedPrice | null;
  readonly unitSalePrice: ParsedPrice | null;
  readonly mfgDate: ParsedDate | null;
  /**
   * Observable reasons to believe this is an imported commodity. Empty means we
   * have no evidence either way — which changes how harshly a missing country of
   * origin is treated rather than whether it is reported at all.
   */
  readonly importSignals: readonly string[];
  readonly evaluatedAt: Date;
}

/** A single failed clause. Maps 1:1 onto a `Violation` row. */
export interface ViolationFinding {
  ruleCode: string;
  ruleTitle: string;
  description: string;
  severity: RuleSeverity;
  suggestedAction: string;
}

/** The outcome of one clause: either it passed, or it produced a finding. */
export type ClauseResult = ViolationFinding | null;

/**
 * A clause is a plain function plus the metadata the scorer and report need.
 * Deliberately not a DSL — an officer or a judge can read the function body and
 * see exactly why a package failed.
 */
export interface RuleClause {
  /** Stable internal identifier, e.g. "LM-PCR-6(1)(a)". */
  readonly code: string;
  readonly title: string;
  /** Plain-language statutory pointer, printed in the report. */
  readonly reference: string;
  /** Share of the compliance score this clause is worth. */
  readonly weight: number;
  /** Clauses that do not apply to a given package are excluded from the score. */
  readonly appliesTo?: (ctx: RuleContext) => boolean;
  readonly evaluate: (ctx: RuleContext) => ClauseResult;
}

export interface ClauseOutcome {
  code: string;
  title: string;
  reference: string;
  weight: number;
  applicable: boolean;
  passed: boolean;
  finding: ViolationFinding | null;
}

export interface ComplianceScoreBreakdown {
  /** 0–100, rounded. */
  score: number;
  applicableWeight: number;
  lostWeight: number;
  clausesEvaluated: number;
  clausesApplicable: number;
  clausesFailed: number;
  criticalCount: number;
  moderateCount: number;
  minorCount: number;
}

export interface ComplianceResult {
  violations: ViolationFinding[];
  score: number;
  breakdown: ComplianceScoreBreakdown;
  /** Per-clause detail, including passes — this is what makes the score auditable. */
  outcomes: ClauseOutcome[];
}

/** Ordering used everywhere a violation list is displayed or printed. */
export const SEVERITY_ORDER: Record<RuleSeverity, number> = {
  CRITICAL: 0,
  MODERATE: 1,
  MINOR: 2,
};
