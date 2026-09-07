import { SeverityCounts } from '@/components/scans/severity-counts';
import { EmptyState } from '@/components/ui/empty-state';
import { Mono, TableWrap, Td, Th } from '@/components/ui/table';
import type { RuleStatDto } from '@/lib/api/dto';

/**
 * Violation statistics by rule type.
 *
 * This is the screen that turns individual inspections into policy: if 40% of all
 * findings are a missing consumer-care block, that is where an enforcement drive
 * should go. The statutory reference is printed alongside each code so the table can
 * be quoted directly in a departmental note without cross-referencing the rule book.
 */
export function RuleStatsTable({ ruleStats }: { ruleStats: RuleStatDto[] }) {
  if (ruleStats.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="No violations recorded yet"
        description="Once officers have processed scans, the clauses breached most often will be ranked here."
        className="py-10"
      />
    );
  }

  const max = ruleStats[0]?.count ?? 0;

  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Clause</Th>
          <Th>Severity mix</Th>
          <Th align="right">Findings</Th>
          <Th align="right">Share</Th>
        </tr>
      </thead>
      <tbody>
        {ruleStats.map((stat) => (
          <tr key={stat.ruleCode}>
            <Td>
              <div className="min-w-0 max-w-xl">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <Mono className="font-semibold text-brand">{stat.ruleCode}</Mono>
                  <span className="font-medium text-ink">{stat.ruleTitle}</span>
                </p>
                <p className="mt-1 text-label leading-relaxed text-ink-muted">{stat.reference}</p>
              </div>
            </Td>

            <Td>
              <SeverityCounts counts={stat.severityBreakdown} />
            </Td>

            <Td align="right">
              <span className="text-body font-semibold tabular-nums text-ink">{stat.count}</span>
            </Td>

            <Td align="right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-body tabular-nums text-ink-secondary">{stat.share}%</span>
                <span className="h-1.5 w-16 overflow-hidden rounded-pill bg-line" aria-hidden="true">
                  <span
                    className="block h-full rounded-pill bg-brand"
                    style={{ width: `${max === 0 ? 0 : Math.round((stat.count / max) * 100)}%` }}
                  />
                </span>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
