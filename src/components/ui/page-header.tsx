import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The single H1 for a screen, plus optional actions.
 *
 * Type hierarchy is deliberately shallow: one h1 at 1.375rem and everything else
 * at or below the h3 step, which keeps the dashboard within the "no more than two
 * sizes above body text" rule the design system sets.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-5', className)}>
      {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-body text-ink-secondary">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
