import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Disabled states are handled per-variant rather than with a blanket `opacity`.
 *
 * A filled button dimmed with both a semi-transparent background *and* reduced opacity
 * ended up with white text at roughly 2.6:1 against the card behind it — legible only
 * if you already knew what it said. Filled variants therefore switch to a *solid* muted
 * slate when disabled, which keeps the white label at about 4:1 while still reading
 * clearly as unavailable. Only the outline and text variants use opacity, where there
 * is no white-on-pale-fill problem to create.
 */
const DISABLED_FILLED = 'disabled:bg-ink-muted disabled:text-ink-inverse';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `bg-brand text-ink-inverse hover:bg-brand-hover active:bg-brand ${DISABLED_FILLED}`,
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-muted hover:border-ink-muted active:bg-brand-muted disabled:opacity-60',
  ghost: 'bg-transparent text-ink-secondary hover:bg-brand-muted hover:text-brand disabled:opacity-60',
  // Reserved for genuinely destructive acts, so it stays rare and therefore legible.
  danger: `bg-critical text-ink-inverse hover:bg-critical/90 active:bg-critical ${DISABLED_FILLED}`,
  link: 'bg-transparent text-brand underline underline-offset-2 hover:text-brand-hover px-0 py-0 h-auto disabled:opacity-60',
};

const SIZES: Record<ButtonSize, string> = {
  // 44px minimum touch target on md and lg — these screens are used one-handed
  // on a phone in a market.
  sm: 'h-8 px-3 text-label gap-1.5',
  md: 'h-11 px-4 text-body gap-2 sm:h-9',
  lg: 'h-12 px-5 text-body-lg gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction without collapsing the layout. */
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, fullWidth, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // `aria-busy` tells a screen reader the control is working; `disabled`
      // alone would silently swallow that information.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        variant !== 'link' && SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});

/**
 * Shared class string, so a link that should look like a button gets the identical
 * treatment without nesting an `<a>` inside a `<button>` (invalid HTML, and it
 * breaks keyboard activation).
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium',
    'transition-colors duration-150',
    VARIANTS[variant],
    variant !== 'link' && SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}
