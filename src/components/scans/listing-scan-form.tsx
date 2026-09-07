'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { LinkIcon } from '@/components/layout/icons';
import { ScanProgressCard } from '@/components/scans/scan-progress-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import type { ScanSummaryDto } from '@/lib/api/dto';
import { apiFetch, errorMessage } from '@/lib/http';

interface ListingResponse {
  scan: ScanSummaryDto;
  queued: boolean;
  warning?: string;
  listing: {
    url: string;
    title: string | null;
    imageUrl: string;
    declarationLinesFound: number;
    pageTextLength: number;
  };
}

/**
 * Compliance check of an e-commerce product listing.
 *
 * The problem statement asks for three kinds of subject — product labels, package
 * images and product listings — and this is the third. Under Rule 6(10) of the Legal
 * Metrology (Packaged Commodities) Rules, 2011 an e-commerce entity must display the
 * mandatory declarations on the product display page itself, so the page is a
 * legitimate subject and a declaration published as page text is a declaration made.
 *
 * The capture is synchronous rather than queued, on purpose: a typo, a paywall or a
 * listing that builds itself in the browser needs to be a message on this form, not a
 * scan that looks queued and fails a minute later with something the officer cannot
 * act on. Once captured, it joins the ordinary queue and is processed identically to a
 * photographed pack.
 */
export function ListingScanForm() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [productName, setProductName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListingResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      setError('Paste the listing address first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<ListingResponse>('/api/scans/listing', {
        method: 'POST',
        body: JSON.stringify({
          url: url.trim(),
          productName: productName.trim() || null,
        }),
      });
      setResult(response);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, 'That listing could not be captured.'));
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    setResult(null);
    setUrl('');
    setProductName('');
    setError(null);
  }

  if (result) {
    return (
      <ScanProgressCard
        scanId={result.scan.id}
        title="Listing captured"
        queueWarning={result.queued ? null : (result.warning ?? null)}
        startAnotherLabel="Check another listing"
        onStartAnother={startAnother}
        provenance={
          <div className="rounded-control border border-line bg-surface-muted px-3 py-2.5">
            <p className="text-label font-medium text-ink">What was captured</p>
            <dl className="mt-1.5 space-y-1 text-label text-ink-secondary">
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">Page</dt>
                <dd className="min-w-0 break-all">
                  <a
                    href={result.listing.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-brand hover:underline"
                  >
                    {result.listing.url}
                  </a>
                </dd>
              </div>
              {result.listing.title ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-muted">Title</dt>
                  <dd className="min-w-0">{result.listing.title}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">Text</dt>
                <dd>
                  {result.listing.pageTextLength.toLocaleString('en-IN')} characters,{' '}
                  {result.listing.declarationLinesFound} line
                  {result.listing.declarationLinesFound === 1 ? '' : 's'} bearing on Rule 6
                </dd>
              </div>
            </dl>
            {result.listing.declarationLinesFound === 0 ? (
              <p className="mt-2 text-label text-ink-muted">
                No declaration-bearing text was recognised, so the assessment will rest on the
                product image alone.
              </p>
            ) : null}
          </div>
        }
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader
          title="Product listing address"
          description="The page is fetched, its product image and visible declarations are captured, and both become part of the inspection record."
        />

        <CardBody className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <Field
            label="Listing URL"
            hint="Must be an https:// address on a public site. The page is fetched once, read only, and nothing is submitted to it."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.example.com/product/turmeric-powder-500g"
                maxLength={2048}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <Field
            label="Product name"
            hint="Optional. Leave blank to use the title published on the listing."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="e.g. Sundar Foods Turmeric Powder 500 g"
                maxLength={180}
                disabled={busy}
              />
            )}
          </Field>

          <Alert tone="info" title="What this can and cannot read">
            A listing whose content is assembled in the browser may return little or nothing,
            because no scripts are run during capture. If the capture comes back thin, photograph
            the pack instead — the finding must rest on evidence, not on an empty page.
          </Alert>
        </CardBody>

        <CardFooter className="justify-between">
          <p className="text-label text-ink-muted">
            {busy ? 'Fetching and reading the listing\u2026' : 'Capture usually takes a few seconds.'}
          </p>
          <Button type="submit" loading={busy} disabled={!url.trim()}>
            <LinkIcon className="h-4 w-4" />
            Capture and assess
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
