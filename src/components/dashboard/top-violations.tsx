import Link from 'next/link';

import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { DashboardStatsDto } from '@/lib/api/dto';

/**
 * Most frequently breached clauses.
 *
 * A ranked list with proportional bars, not a pie chart: the useful comparison is
 * "which clause is worst, and by how much", and length is far easier to compare than
 * angle. Each row links into the history filtered to that severity so the officer can
 * go straight from insight to the underlying scans.
 */
export function TopViolations({ items }: { items: DashboardStatsDto['topViolations'] }) {
  const max = items.reduce((highest, item) => Math.max(highest, item.count), 0);

  return (
    <Card>
      <CardHeader
        title="Most breached clauses"
        description="Across all scans you have recorded"
        as="h3"
        actions={
          <Link
            href="/scans?status=COMPLETED"
            className="text-label font-medium text-brand hover:text-brand-hover hover:underline"
          >
            View scans
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="check"
          title="No violations recorded"
          description="Once scans are processed, the clauses breached most often will be ranked here."
          className="py-9"
        />
      ) : (
        <CardBody className="space-y-3 py-4">
          {items.map((item) => (
            <div key={item.ruleCode}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-body text-ink">
                  <span className="font-mono text-label text-brand">{item.ruleCode}</span>
                  <span className="mx-1.5 text-ink-muted" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-ink-secondary">{item.ruleTitle}</span>
                </p>
                <span className="shrink-0 text-body font-semibold tabular-nums text-ink">
                  {item.count}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-line">
                <div
                  className="h-full rounded-pill bg-brand"
                  style={{ width: `${max === 0 ? 0 : Math.round((item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}
