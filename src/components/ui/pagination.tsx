import Link from 'next/link';

import { cn } from '@/lib/cn';
import type { PaginationDto } from '@/lib/api/dto';

/**
 * Page navigation.
 *
 * Real `<Link>`s carrying the full query string, not buttons driving client state —
 * so a filtered page of the register can be bookmarked, shared with a colleague, or
 * reopened by the back button exactly as it was. Page size stays fixed; an officer
 * scanning a register wants a predictable rhythm, not a size selector.
 */
export function Pagination({
  pagination,
  buildHref,
  className,
}: {
  pagination: PaginationDto;
  buildHref: (page: number) => string;
  className?: string;
}) {
  const { page, pageSize, total, totalPages } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row sm:px-5',
        className,
      )}
    >
      <p className="text-label text-ink-secondary">
        Showing <span className="font-semibold text-ink">{first}</span>–
        <span className="font-semibold text-ink">{last}</span> of{' '}
        <span className="font-semibold text-ink">{total}</span> scans
      </p>

      <div className="flex items-center gap-1.5">
        <PageLink href={buildHref(page - 1)} disabled={!hasPrevious}>
          Previous
        </PageLink>

        <span className="px-2 text-label tabular-nums text-ink-secondary">
          Page {page} of {totalPages}
        </span>

        <PageLink href={buildHref(page + 1)} disabled={!hasNext}>
          Next
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const classes =
    'inline-flex h-9 items-center rounded-control border px-3 text-label font-medium transition-colors';

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(classes, 'cursor-not-allowed border-line bg-surface-muted text-ink-muted')}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(classes, 'border-line-strong bg-surface text-ink hover:bg-surface-muted')}
    >
      {children}
    </Link>
  );
}
