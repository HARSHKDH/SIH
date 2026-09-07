import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * Table shell.
 *
 * The horizontal scroll container is the important part: these tables are
 * data-dense by design and are also used on a phone, so the layout scrolls rather
 * than collapsing columns and losing information.
 */
export function TableWrap({
  className,
  minWidth = '42rem',
  children,
}: {
  className?: string;
  /** Below this width the container scrolls rather than squeezing columns. */
  minWidth?: string;
  children: ReactNode;
}) {
  return (
    // `.scroll-x-contained` is `overflow-x: auto` plus `contain: paint`. See the note
    // in globals.css: without the containment a wide table drags the whole document
    // into horizontal scroll on a phone.
    <div className={cn('w-full scroll-x-contained', className)}>
      <table className="data-table" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  className,
  children,
  align = 'left',
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  align = 'left',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** Primary cell text plus a muted secondary line — used heavily in the registers. */
export function CellStack({
  primary,
  secondary,
  className,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate font-medium text-ink">{primary}</div>
      {secondary ? <div className="mt-0.5 truncate text-label text-ink-muted">{secondary}</div> : null}
    </div>
  );
}

export function Mono({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('font-mono text-label tracking-tight text-ink-secondary', className)}>
      {children}
    </span>
  );
}
