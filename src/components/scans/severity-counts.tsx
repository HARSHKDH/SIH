import { cn } from '@/lib/cn';
import type { ViolationCountsDto } from '@/lib/api/dto';

/**
 * Compact severity tally for table rows.
 *
 * Three small chips rather than a single "4 violations" number, because the mix
 * matters far more than the count: one critical finding is a different enforcement
 * situation from four minor drafting defects.
 */
export function SeverityCounts({
  counts,
  className,
}: {
  counts: ViolationCountsDto;
  className?: string;
}) {
  if (counts.total === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-label font-medium text-compliant',
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-pill bg-current" aria-hidden="true" />
        No findings
      </span>
    );
  }

  const chips = [
    { count: counts.critical, label: 'critical', classes: 'bg-critical-soft text-critical border-critical-border' },
    { count: counts.moderate, label: 'moderate', classes: 'bg-moderate-soft text-moderate border-moderate-border' },
    {
      count: counts.minor,
      label: 'minor',
      classes: 'bg-neutralBadge-soft text-neutralBadge border-neutralBadge-border',
    },
  ].filter((chip) => chip.count > 0);

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {chips.map((chip) => (
        <span
          key={chip.label}
          title={`${chip.count} ${chip.label} violation${chip.count === 1 ? '' : 's'}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 text-micro font-semibold tabular-nums',
            chip.classes,
          )}
        >
          {chip.count}
          <span className="font-medium uppercase tracking-wider">{chip.label.slice(0, 3)}</span>
        </span>
      ))}
    </span>
  );
}
