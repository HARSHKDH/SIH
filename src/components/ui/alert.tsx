import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<AlertTone, { wrapper: string; icon: string; path: ReactNode }> = {
  info: {
    wrapper: 'border-line bg-brand-muted/60 border-l-brand',
    icon: 'text-brand',
    path: (
      <>
        <circle cx="10" cy="10" r="7.25" strokeWidth="1.5" />
        <path d="M10 9v4.5" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M10 6.6h.01" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  success: {
    wrapper: 'border-compliant-border bg-compliant-soft border-l-compliant',
    icon: 'text-compliant',
    path: (
      <>
        <circle cx="10" cy="10" r="7.25" strokeWidth="1.5" />
        <path d="M6.9 10.3l2.1 2.1 4.1-4.4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  warning: {
    wrapper: 'border-moderate-border bg-moderate-soft border-l-moderate',
    icon: 'text-moderate',
    path: (
      <>
        <path d="M10 3.2l6.6 12.1H3.4L10 3.2z" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 8v3.4" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M10 13.4h.01" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  error: {
    wrapper: 'border-critical-border bg-critical-soft border-l-critical',
    icon: 'text-critical',
    path: (
      <>
        <circle cx="10" cy="10" r="7.25" strokeWidth="1.5" />
        <path d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
};

/**
 * Inline message block.
 *
 * Errors and warnings are announced politely rather than assertively: they appear
 * as the result of an officer's own action, so interrupting the screen reader
 * mid-sentence would be more disorienting than helpful.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const config = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn('flex gap-3 rounded-card border border-l-[3px] px-4 py-3', config.wrapper, className)}
    >
      <svg
        className={cn('mt-px h-5 w-5 shrink-0', config.icon)}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        {config.path}
      </svg>

      <div className="min-w-0 flex-1">
        {title ? <p className="text-body font-semibold text-ink">{title}</p> : null}
        {children ? (
          <div className={cn('text-body text-ink-secondary', title && 'mt-0.5')}>{children}</div>
        ) : null}
        {actions ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
