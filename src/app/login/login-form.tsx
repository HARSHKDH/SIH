'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { SessionUserDto } from '@/lib/api/dto';
import type { ExtractionProvider } from '@/lib/env';
import { apiFetch, errorMessage, fieldErrors } from '@/lib/http';

interface LoginResponse {
  user: SessionUserDto;
  redirectTo: string;
}

/** Only same-origin absolute paths are honoured, so `?next=` cannot be used for an open redirect. */
function safeRedirect(target: string | undefined, fallback: string): string {
  if (!target) return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}

export function LoginForm({
  nextPath,
  showDemoHint = false,
  extractionMode,
}: {
  nextPath?: string;
  showDemoHint?: boolean;
  extractionMode?: ExtractionProvider;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrors({});

    try {
      const result = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // `replace` so the browser back button cannot return to a filled-in login form.
      router.replace(safeRedirect(nextPath, result.redirectTo));
      // The shell reads the session server-side, so the tree has to be refetched.
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, 'Sign-in failed. Please try again.'));
      setErrors(fieldErrors(caught));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Email address" error={errors.email} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            required
            placeholder="officer@legalmetrology.gov.in"
          />
        )}
      </Field>

      <Field label="Password" error={errors.password} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        )}
      </Field>

      <Button type="submit" size="lg" fullWidth loading={submitting}>
        {submitting ? 'Signing in\u2026' : 'Sign in'}
      </Button>

      {showDemoHint ? (
        <Alert tone="info" title="Demo credentials" className="mt-5">
          <p className="text-label">
            Seeded by <code className="font-mono">npm run db:seed</code>:
          </p>
          <ul className="mt-1.5 space-y-1 text-label">
            <li>
              <span className="font-medium text-ink">Officer</span> ·{' '}
              <code className="font-mono">officer@legalmetrology.gov.in</code> /{' '}
              <code className="font-mono">Officer@123</code>
            </li>
            <li>
              <span className="font-medium text-ink">Admin</span> ·{' '}
              <code className="font-mono">admin@legalmetrology.gov.in</code> /{' '}
              <code className="font-mono">Admin@123</code>
            </li>
          </ul>
          {extractionMode === 'mock' ? (
            <p className="mt-2 text-label">
              No <code className="font-mono">GEMINI_API_KEY</code> is set, so new scans use the
              offline deterministic extractor. The queue, rule engine and PDF report all run
              normally.
            </p>
          ) : null}
        </Alert>
      ) : null}
    </form>
  );
}
