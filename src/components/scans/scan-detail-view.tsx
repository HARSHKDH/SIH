'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { DownloadIcon, RetryIcon } from '@/components/layout/icons';
import { AttachmentPanel } from '@/components/scans/attachment-panel';
import { DeclarationList } from '@/components/scans/declaration-list';
import { LabelImage } from '@/components/scans/label-image';
import { OfficerNoteForm } from '@/components/scans/officer-note-form';
import { PipelineProgress } from '@/components/scans/pipeline-progress';
import { SeverityCounts } from '@/components/scans/severity-counts';
import { ViolationList } from '@/components/scans/violation-list';
import { useScanPolling } from '@/components/scans/use-scan-polling';
import { Alert } from '@/components/ui/alert';
import { BandBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { AnchorButton } from '@/components/ui/link-button';
import { PageHeader } from '@/components/ui/page-header';
import { ScoreGauge } from '@/components/ui/score-gauge';
import type { ScanDetailDto } from '@/lib/api/dto';
import type { DeclarationKey } from '@/lib/extraction/schema';
import { formatConfidence, formatDateTime, formatMillimetres, scanRef } from '@/lib/format';
import { apiFetch, errorMessage } from '@/lib/http';

/**
 * Scan detail.
 *
 * A client component wrapping server-fetched data, for one reason: a scan opened while
 * the worker is still running has to come alive without a manual refresh. `useScanPolling`
 * only polls while the status is non-terminal, so a completed scan does no network work
 * at all — it is effectively a static page that happens to be hydrated.
 */
export function ScanDetailView({
  initialScan,
  canMutate,
}: {
  initialScan: ScanDetailDto;
  canMutate: boolean;
}) {
  const router = useRouter();
  const { scan, setScan, elapsedSeconds, error: pollError, isPolling } = useScanPolling(
    initialScan.id,
    initialScan,
  );

  const [highlighted, setHighlighted] = useState<DeclarationKey | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const current = scan ?? initialScan;
  const completed = current.status === 'COMPLETED';
  const failed = current.status === 'FAILED';
  const inFlight = current.status === 'PENDING' || current.status === 'PROCESSING';

  async function retry() {
    setRetrying(true);
    setActionError(null);
    try {
      const result = await apiFetch<{ scan: ScanDetailDto }>(`/api/scans/${current.id}/retry`, {
        method: 'POST',
      });
      setScan(result.scan);
      router.refresh();
    } catch (caught) {
      setActionError(errorMessage(caught, 'Could not re-queue this scan.'));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-label text-ink-muted">
            <a href="/scans" className="hover:text-brand hover:underline">
              Scan history
            </a>
            <span className="mx-1.5" aria-hidden="true">
              /
            </span>
            <span className="font-mono">LM/{scanRef(current.id)}</span>
          </nav>
        }
        title={current.productName ?? 'Unnamed product'}
        description={
          <>
            Recorded by {current.officer?.name ?? 'an officer'} on{' '}
            {formatDateTime(current.createdAt)}
            {/*
              A listing assessment and a photographed pack carry different evidential
              weight — one is the officer's own observation of a physical package, the
              other a record of what a seller published at a URL on a date. Stating
              which, with the URL, keeps that distinction visible rather than buried in
              the report.
            */}
            {current.source === 'ECOMMERCE_LISTING' ? (
              <>
                <span className="mx-1.5 text-ink-muted" aria-hidden="true">
                  ·
                </span>
                <span className="text-ink-secondary">
                  from an e-commerce listing
                  {current.sourceUrl ? (
                    <>
                      {' '}
                      <a
                        href={current.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="break-all text-brand hover:underline"
                      >
                        {current.sourceUrl}
                      </a>
                    </>
                  ) : null}
                </span>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <StatusBadge status={current.status} />
            {completed ? (
              <>
                <AnchorButton
                  href={`/api/scans/${current.id}/report?download=1`}
                  variant="primary"
                  download
                >
                  <DownloadIcon className="h-4 w-4" />
                  PDF report
                </AnchorButton>
                {/*
                  The problem statement asks for reports in PDF *and* editable formats,
                  so the Word version is a peer of the PDF rather than a hidden extra:
                  an officer who has to add a paragraph before filing should not have to
                  go looking for it.
                */}
                <AnchorButton
                  href={`/api/scans/${current.id}/report/docx`}
                  variant="secondary"
                  download
                >
                  <DownloadIcon className="h-4 w-4" />
                  Editable (.docx)
                </AnchorButton>
              </>
            ) : null}
            {failed && canMutate ? (
              <Button type="button" onClick={retry} loading={retrying}>
                <RetryIcon className="h-4 w-4" />
                Retry processing
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      ) : null}
      {pollError ? (
        <Alert tone="warning" className="mb-4">
          {pollError}
        </Alert>
      ) : null}

      {/* ---- In-flight ---- */}
      {inFlight ? (
        <Card className="mb-4">
          <CardHeader
            title="Assessment in progress"
            description={
              isPolling
                ? 'This page updates itself as the worker progresses.'
                : 'Refresh to check for an update.'
            }
          />
          <CardBody>
            <PipelineProgress status={current.status} elapsedSeconds={elapsedSeconds} />
            {current.attemptCount > 1 ? (
              <p className="mt-3 text-label text-ink-muted">
                Attempt {current.attemptCount} of this scan.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ---- Failed ---- */}
      {failed ? (
        <Alert
          tone="error"
          title="Processing failed"
          className="mb-4"
          actions={
            canMutate ? (
              <Button type="button" size="sm" onClick={retry} loading={retrying}>
                <RetryIcon className="h-3.5 w-3.5" />
                Retry processing
              </Button>
            ) : null
          }
        >
          <p>
            {current.failureReason ??
              'The scan could not be processed. Retry, or record a new photograph if the image is unusable.'}
          </p>
          {current.attemptCount > 1 ? (
            <p className="mt-1 text-label text-ink-muted">
              {current.attemptCount} attempts have been made.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {/* ---- Verdict ---- */}
      {completed && current.complianceScore !== null && current.band ? (
        <Card className="mb-4">
          <CardBody className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <ScoreGauge score={current.complianceScore} band={current.band} size="md" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BandBadge band={current.band} />
                <SeverityCounts counts={current.violationCounts} />
              </div>
              <p className="mt-2 max-w-2xl text-body text-ink-secondary">
                {current.violationCounts.total === 0
                  ? 'Every applicable clause was satisfied by the declarations read from this label.'
                  : `${current.violationCounts.total} clause${
                      current.violationCounts.total === 1 ? '' : 's'
                    } of the Packaged Commodities Rules, 2011 were breached. The score is a weighted deduction across the clauses that could be assessed from this photograph.`}
              </p>
              {current.overallNotes ? (
                <p className="mt-2 max-w-2xl border-l-2 border-line-strong pl-3 text-label italic text-ink-muted">
                  {current.overallNotes}
                </p>
              ) : null}
            </div>

            <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-1">
              <div>
                <dt className="text-micro uppercase tracking-wider text-ink-muted">Assessed</dt>
                <dd className="text-label font-medium text-ink">
                  {formatDateTime(current.processedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-micro uppercase tracking-wider text-ink-muted">Reference</dt>
                <dd className="font-mono text-label font-medium text-ink">
                  LM/{scanRef(current.id)}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      ) : null}

      {/* ---- Evidence + declarations ---- */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        {/*
          The evidence column sticks below the top bar on wide screens. Cross-checking
          a finding against the photograph is the core action on this page, and it
          should not require scrolling back up to see the label.
        */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-[4.5rem] xl:col-span-2">
          <LabelImage
            imageUrl={current.imageUrl}
            declarations={current.declarations}
            highlighted={highlighted}
            onHighlight={setHighlighted}
          />

          {current.imageAssessment ? (
            <Card>
              <CardHeader title="Image assessment" as="h3" />
              <CardBody className="space-y-2 py-3">
                <Row
                  label="Languages on label"
                  value={
                    current.imageAssessment.detected_languages.length > 0
                      ? current.imageAssessment.detected_languages.join(', ')
                      : 'Not determined'
                  }
                />
                {current.imageAssessment.issues.length > 0 ? (
                  <Row label="Conditions noted" value={current.imageAssessment.issues.join('; ')} />
                ) : null}
                {current.relativeTextSizes ? (
                  <>
                    <Row
                      label="Display panel area"
                      value={
                        current.relativeTextSizes.principal_display_panel_area_cm2_est !== null
                          ? `${Math.round(current.relativeTextSizes.principal_display_panel_area_cm2_est)} cm²`
                          : 'Not estimated'
                      }
                    />
                    <Row
                      label="Smallest declaration"
                      value={formatMillimetres(
                        current.relativeTextSizes.smallest_declaration_text_height_mm_est,
                      )}
                      tone={
                        current.relativeTextSizes.smallest_appears_illegible ? 'critical' : 'default'
                      }
                    />
                    <Row
                      label="Legible to a consumer"
                      value={current.relativeTextSizes.smallest_appears_illegible ? 'No' : 'Yes'}
                      tone={
                        current.relativeTextSizes.smallest_appears_illegible
                          ? 'critical'
                          : 'compliant'
                      }
                    />
                  </>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 xl:col-span-3">
          <Card>
            <CardHeader
              title="Declarations read from the label"
              description="Transcribed verbatim. Hover a row to locate it on the photograph."
              as="h3"
              actions={
                current.declarations.length > 0 ? (
                  <span className="text-label text-ink-muted">
                    {current.declarations.filter((d) => d.valueFound).length} of{' '}
                    {current.declarations.length} found
                  </span>
                ) : null
              }
            />
            {current.declarations.length > 0 ? (
              <DeclarationList
                declarations={current.declarations}
                highlighted={highlighted}
                onHighlight={setHighlighted}
              />
            ) : (
              <CardBody>
                <p className="text-body text-ink-muted">
                  Declarations appear here once the label has been transcribed.
                </p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Violations"
              description="Most serious first, with the clause breached and the action to take."
              as="h3"
              actions={
                completed ? <SeverityCounts counts={current.violationCounts} /> : null
              }
            />
            {completed ? (
              <ViolationList violations={current.violations} />
            ) : (
              <CardBody>
                <p className="text-body text-ink-muted">
                  Findings appear here once the rule engine has run.
                </p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Officer's observation"
              description="Recorded against this scan and reprinted in the PDF report."
              as="h3"
            />
            <OfficerNoteForm
              scan={current}
              readOnly={!canMutate}
              onSaved={(updated) => {
                setScan(updated);
                router.refresh();
              }}
            />
          </Card>

          <Card>
            <CardHeader
              title="Supporting evidence"
              description="Photographs and documents corroborating this inspection. Listed in both reports."
              as="h3"
              actions={
                current.attachments.length > 0 ? (
                  <span className="text-label text-ink-muted">
                    {current.attachments.length} attached
                  </span>
                ) : null
              }
            />
            <AttachmentPanel
              scan={current}
              readOnly={!canMutate}
              onChanged={(updated) => {
                setScan(updated);
                router.refresh();
              }}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'compliant' | 'critical';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-label text-ink-muted">{label}</span>
      <span
        className={
          tone === 'critical'
            ? 'text-label font-semibold text-critical'
            : tone === 'compliant'
              ? 'text-label font-semibold text-compliant'
              : 'text-label font-medium text-ink'
        }
      >
        {value}
      </span>
    </div>
  );
}
