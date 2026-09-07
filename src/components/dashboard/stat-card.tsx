import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type StatTone = 'default' | 'compliant' | 'moderate' | 'critical';

const VALUE_TONE: Record<StatTone, string> = {
  default: 'text-ink',
  compliant: 'text-compliant',
  moderate: 'text-moderate',
  critical: 'text-critical',
};

const ACCENT_TONE: Record<StatTone, string> = {
  default: 'bg-brand',
  compliant: 'bg-compliant',
  moderate: 'bg-moderate',
  critical: 'bg-critical',
};

/**
 * A single dashboard figure.
 *
 * The number is the only element above body size, and the tone is carried by a thin
 * left accent plus the value colour rather than a filled card — a wall of coloured
 * blocks would read as a consumer dashboard, not a compliance register.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span
        className={cn('absolute inset-y-0 left-0 w-[3px]', ACCENT_TONE[tone])}
        aria-hidden="true"
      />
      <p className="text-micro font-semibold uppercase tracking-wider text-ink-secondary">
        {label}
      </p>
      <p className={cn('mt-2 text-stat font-semibold tabular-nums', VALUE_TONE[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-label text-ink-muted">{hint}</p> : null}
    </>
  );

  const shell = cn(
    'relative overflow-hidden rounded-card border border-line bg-surface px-4 py-3.5 shadow-card sm:px-5',
    href && 'transition-colors hover:border-line-strong hover:bg-surface-muted',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(shell, 'block')}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
