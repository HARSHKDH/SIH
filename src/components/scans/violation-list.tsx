import { SeverityBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { ViolationDto } from '@/lib/api/dto';

/**
 * The findings.
 *
 * Every entry carries the rule code, the severity, what was observed, and what to do
 * about it. That last part is the difference between a tool that reports and a tool
 * that is usable: an officer standing in a shop needs the remedy, not just the defect.
 * Ordering is by severity, so the most serious finding is always first.
 */
export function ViolationList({ violations }: { violations: ViolationDto[] }) {
  if (violations.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="No violations detected"
        description="Every applicable clause in the rule book was satisfied by the declarations read from this label."
        className="py-10"
      />
    );
  }

  return (
    <ol className="divide-y divide-line">
      {violations.map((violation, index) => (
        <li key={violation.id} className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-brand text-micro font-semibold text-ink-inverse"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span className="font-mono text-label font-semibold text-brand">
              {violation.ruleCode}
            </span>
            <span className="text-body font-semibold text-ink">{violation.ruleTitle}</span>
            <SeverityBadge severity={violation.severity} className="ml-auto" />
          </div>

          <p className="mt-2 text-body text-ink">{violation.description}</p>

          {violation.suggestedAction ? (
            <div className="mt-2.5 border-l-2 border-brand-hover bg-canvas px-3 py-2">
              <p className="text-micro font-semibold uppercase tracking-wider text-ink-muted">
                Recommended action
              </p>
              <p className="mt-0.5 text-body text-ink-secondary">{violation.suggestedAction}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
