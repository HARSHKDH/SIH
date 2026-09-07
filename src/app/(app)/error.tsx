'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';

/**
 * Error boundary for the authenticated area.
 *
 * Shows the digest rather than the stack: an officer cannot act on a stack trace, but
 * quoting the digest to an administrator lets them find the exact server log entry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] unhandled error in the authenticated area:', error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader
        title="Something went wrong on this screen"
        description="The rest of the application is unaffected."
      />
      <CardBody className="space-y-3">
        <p className="text-body text-ink-secondary">
          Try again. If it keeps happening, quote the reference below to your administrator so they
          can match it to the server log.
        </p>
        {error.digest ? (
          <p className="rounded-control border border-line bg-surface-muted px-3 py-2 font-mono text-label text-ink-secondary">
            Reference: {error.digest}
          </p>
        ) : null}
      </CardBody>
      <CardFooter>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <LinkButton href="/dashboard" variant="secondary">
          Back to dashboard
        </LinkButton>
      </CardFooter>
    </Card>
  );
}
