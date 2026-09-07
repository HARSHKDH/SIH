'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

/**
 * Form controls.
 *
 * Every control is wrapped in the same `Field` so that a label, hint and error are
 * always wired together with `htmlFor`, `aria-describedby` and `aria-invalid`.
 * Getting this right once here means no screen in the app can ship an unlabelled
 * input by accident.
 */

const CONTROL_BASE =
  'w-full rounded-control border bg-surface px-3 text-body text-ink transition-colors ' +
  'placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted';

const CONTROL_BORDER = 'border-line-strong hover:border-ink-muted focus:border-brand-hover';
const CONTROL_INVALID = 'border-critical hover:border-critical focus:border-critical';

// 44px on mobile shrinking to 36px from `sm` up — comfortable on a phone,
// compact on a desk.
const CONTROL_HEIGHT = 'h-11 sm:h-9';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Receives the wiring so the control can be any element. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label font-medium text-ink-secondary">
        {label}
        {required ? (
          <span className="ml-1 text-critical" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {hint && !error ? (
        <p id={hintId} className="text-label text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-label font-medium text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          CONTROL_BASE,
          CONTROL_HEIGHT,
          props['aria-invalid'] ? CONTROL_INVALID : CONTROL_BORDER,
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          CONTROL_BASE,
          'resize-y py-2 leading-relaxed',
          props['aria-invalid'] ? CONTROL_INVALID : CONTROL_BORDER,
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            CONTROL_BASE,
            CONTROL_HEIGHT,
            'cursor-pointer appearance-none pr-9',
            props['aria-invalid'] ? CONTROL_INVALID : CONTROL_BORDER,
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  },
);
