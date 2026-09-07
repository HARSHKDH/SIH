import Link from 'next/link';

import { SeverityCounts } from '@/components/scans/severity-counts';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBar } from '@/components/ui/score-gauge';
import { CellStack, Mono, Td, TableWrap, Th } from '@/components/ui/table';
import type { ScanSummaryDto } from '@/lib/api/dto';
import { formatDate, formatRelative, scanRef } from '@/lib/format';

/**
 * The scan register.
 *
 * One table serves the dashboard's recent list and the full history screen, so a
 * scan looks the same wherever an officer meets it. Rendered on the server — there
 * is no client-side sorting or filtering here, because the database already does
 * both and shipping 500 rows to sort in the browser would be slower and less
 * correct.
 */
export function ScanTable({
  scans,
  showOfficer = false,
  emptyTitle = 'No scans recorded yet',
  emptyDescription,
  emptyAction,
}: {
  scans: ScanSummaryDto[];
  showOfficer?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
}) {
  if (scans.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Product / reference</Th>
          {showOfficer ? <Th>Officer</Th> : null}
          <Th>Status</Th>
          <Th align="right">Score</Th>
          <Th>Findings</Th>
          <Th>Recorded</Th>
          <Th align="right">
            <span className="sr-only">Open</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {scans.map((scan) => (
          <tr key={scan.id}>
            <Td>
              <CellStack
                primary={
                  <Link
                    href={`/scans/${scan.id}`}
                    className="text-ink hover:text-brand hover:underline"
                  >
                    {scan.productName ?? 'Unnamed product'}
                  </Link>
                }
                secondary={<Mono>LM/{scanRef(scan.id)}</Mono>}
              />
            </Td>

            {showOfficer ? (
              <Td>
                <span className="text-body text-ink-secondary">{scan.officer?.name ?? '—'}</span>
              </Td>
            ) : null}

            <Td>
              <StatusBadge status={scan.status} />
              {scan.status === 'FAILED' && scan.failureReason ? (
                <p className="mt-1 max-w-[16rem] text-label text-ink-muted line-clamp-2">
                  {scan.failureReason}
                </p>
              ) : null}
            </Td>

            <Td align="right">
              {scan.complianceScore !== null && scan.band ? (
                <ScoreBar score={scan.complianceScore} band={scan.band} className="justify-end" />
              ) : (
                <span className="text-body text-ink-muted">—</span>
              )}
            </Td>

            <Td>
              {scan.status === 'COMPLETED' ? (
                <SeverityCounts counts={scan.violationCounts} />
              ) : (
                <span className="text-body text-ink-muted">—</span>
              )}
            </Td>

            <Td className="whitespace-nowrap">
              <CellStack
                primary={
                  <span className="font-normal text-ink-secondary">
                    {formatRelative(scan.createdAt)}
                  </span>
                }
                // Date only, not date-and-time: the full timestamp is on the detail
                // screen, and squeezing it in here just truncates it.
                secondary={formatDate(scan.createdAt)}
              />
            </Td>

            <Td align="right">
              <Link
                href={`/scans/${scan.id}`}
                className="text-label font-medium text-brand hover:text-brand-hover hover:underline"
              >
                Open
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
