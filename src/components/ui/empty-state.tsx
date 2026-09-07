import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Empty states say what to do next, not just that there is nothing here. A blank
 * panel makes an officer wonder whether the tool is broken.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  icon = 'document',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: 'document' | 'search' | 'check';
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-pill bg-brand-muted text-brand">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
          {icon === 'search' ? (
            <>
              <circle cx="9" cy="9" r="5.5" strokeWidth="1.6" />
              <path d="M13.2 13.2L17 17" strokeWidth="1.6" strokeLinecap="round" />
            </>
          ) : icon === 'check' ? (
            <>
              <circle cx="10" cy="10" r="7.25" strokeWidth="1.5" />
              <path
                d="M6.9 10.3l2.1 2.1 4.1-4.4"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <path
                d="M5 3.25h6.2L15 7v9.75H5V3.25z"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M11 3.4V7h3.7" strokeWidth="1.5" strokeLinejoin="round" />
            </>
          )}
        </svg>
      </span>

      <p className="text-body-lg font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-balance text-body text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
