import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The one surface primitive. White card on the warm off-white canvas, defined by
 * a hairline border with only a whisper of shadow — depth here comes from
 * borders, not elevation.
 */
export function Card({
  className,
  children,
  as: Component = 'section',
}: {
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return (
    <Component
      className={cn(
        // `min-w-0` matters more than it looks. A grid or flex item defaults to
        // `min-width: auto`, so a card containing a min-width table refuses to shrink
        // and drags the whole page into horizontal scroll on a phone. This lets the
        // card shrink and keeps the scrolling inside `TableWrap` where it belongs.
        'min-w-0 rounded-card border border-line bg-surface shadow-card',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  as = 'h2',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  const Heading = as;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className={cn(as === 'h2' ? 'text-h3' : 'text-body-lg', 'font-semibold text-ink')}>
          {title}
        </Heading>
        {description ? (
          <p className="mt-0.5 text-label text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-4 py-4 sm:px-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-t border-line bg-surface-muted px-4 py-3 sm:px-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
