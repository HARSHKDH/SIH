import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { ComplianceBand } from '@/lib/rules/engine';
import type { RuleSeverity } from '@/lib/rules/types';
import { SCAN_STATUS_LABEL, type ScanStatusKey } from '@/lib/labels';

export type BadgeTone = 'brand' | 'compliant' | 'moderate' | 'critical' | 'neutral';

const TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-muted text-brand border-brand/20',
  compliant: 'bg-compliant-soft text-compliant border-compliant-border',
  moderate: 'bg-moderate-soft text-moderate border-moderate-border',
  critical: 'bg-critical-soft text-critical border-critical-border',
  neutral: 'bg-neutralBadge-soft text-neutralBadge border-neutralBadge-border',
};

/** Pill-shaped status badge. Colour always carries a text label as well. */
export function Badge({
  tone = 'neutral',
  className,
  children,
  dot = false,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2 py-0.5',
        'text-micro font-semibold uppercase tracking-wider',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-pill bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Domain-specific badges
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<ScanStatusKey, BadgeTone> = {
  PENDING: 'neutral',
  PROCESSING: 'brand',
  COMPLETED: 'compliant',
  FAILED: 'critical',
};

export function StatusBadge({ status, className }: { status: ScanStatusKey; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className} dot>
      <span className={status === 'PROCESSING' ? 'animate-pulse-soft' : undefined}>
        {SCAN_STATUS_LABEL[status]}
      </span>
    </Badge>
  );
}

const SEVERITY_TONE: Record<RuleSeverity, BadgeTone> = {
  CRITICAL: 'critical',
  MODERATE: 'moderate',
  // Minor findings use the neutral slate rather than amber, so amber keeps its
  // meaning: something an officer should actually act on.
  MINOR: 'neutral',
};

const SEVERITY_LABEL: Record<RuleSeverity, string> = {
  CRITICAL: 'Critical',
  MODERATE: 'Moderate',
  MINOR: 'Minor',
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: RuleSeverity;
  className?: string;
}) {
  return (
    <Badge tone={SEVERITY_TONE[severity]} className={className}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

const BAND_TONE: Record<ComplianceBand, BadgeTone> = {
  COMPLIANT: 'compliant',
  MINOR_ISSUES: 'moderate',
  NON_COMPLIANT: 'critical',
  SERIOUS: 'critical',
};

const BAND_LABEL: Record<ComplianceBand, string> = {
  COMPLIANT: 'Compliant',
  MINOR_ISSUES: 'Minor issues',
  NON_COMPLIANT: 'Non-compliant',
  SERIOUS: 'Seriously non-compliant',
};

export function BandBadge({ band, className }: { band: ComplianceBand; className?: string }) {
  return (
    <Badge tone={BAND_TONE[band]} className={className}>
      {BAND_LABEL[band]}
    </Badge>
  );
}

export { BAND_LABEL, SEVERITY_LABEL };
