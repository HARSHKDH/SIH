import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { buttonClasses, type ButtonSize, type ButtonVariant } from './button';

/**
 * A navigation control that looks like a button.
 *
 * Kept distinct from `Button` on purpose: this renders an anchor, so it is
 * middle-clickable, right-clickable and announced as a link, which is what an
 * officer expects from "Record new scan" or "Download report".
 */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      {children}
    </Link>
  );
}

/** Same treatment for a plain `<a>` — used for report downloads, which are not routes. */
export function AnchorButton({
  href,
  variant = 'secondary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'a'>, 'href' | 'className' | 'children'>) {
  return (
    <a href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      {children}
    </a>
  );
}
