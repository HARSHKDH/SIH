'use client';

import type { ReactNode } from 'react';

import { PipelineProgress } from '@/components/scans/pipeline-progress';
import { useScanPolling } from '@/components/scans/use-scan-polling';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { Spinner } from '@/components/ui/spinner';
import { scanRef } from '@/lib/format';

/**
 * The "submitted, now watching it run" view.
 *
 * Shared by both intake paths — a photographed pack and a captured listing — because
 * once a scan is queued the two are indistinguishable, and keeping one copy means the
 * progress wording, the completion summary and the failure message cannot drift apart
 * between the two screens.
 */
export function ScanProgressCard({
  scanId,
  title = 'Scan submitted',
  queueWarning,
  provenance,
  onStartAnother,
  startAnotherLabel = 'Record another',
}: {
  scanId: string;
  title?: string;
  queueWarning?: string | null;
  /** Optional detail about where the material came from, shown above the progress. */
  provenance?: ReactNode;
  onStartAnother: () => void;
  startAnotherLabel?: string;
}) {
  const { scan, elapsedSeconds, error: pollError } = useScanPolling(scanId, null);

  const status = scan?.status ?? 'PENDING';
  const done = status === 'COMPLETED';
  const failed = status === 'FAILED';

  return (
    <Card>
      <CardHeader
        title={title}
        description={`Reference LM/${scanRef(scanId)}`}
        actions={done || failed ? null : <Spinner label="Processing" className="text-brand" />}
      />

      <CardBody className="space-y-4">
        {queueWarning ? (
          <Alert tone="warning" title="Not queued">
            {queueWarning}
          </Alert>
        ) : null}
        {pollError ? <Alert tone="warning">{pollError}</Alert> : null}
        {provenance}

        <PipelineProgress status={status} elapsedSeconds={elapsedSeconds} />

        {done && scan ? (
          <Alert
            tone={scan.violationCounts.total === 0 ? 'success' : 'warning'}
            title="Assessment complete"
          >
            {scan.violationCounts.total === 0
              ? `Compliance score ${scan.complianceScore}/100 with no violations detected.`
              : `Compliance score ${scan.complianceScore}/100 with ${scan.violationCounts.total} finding${
                  scan.violationCounts.total === 1 ? '' : 's'
                } recorded.`}
          </Alert>
        ) : null}

        {failed && scan ? (
          <Alert tone="error" title="Processing failed">
            {scan.failureReason ??
              'The scan could not be processed. Open the scan to retry or record a new photograph.'}
          </Alert>
        ) : null}
      </CardBody>

      <CardFooter>
        <LinkButton href={`/scans/${scanId}`} variant={done || failed ? 'primary' : 'secondary'}>
          {done || failed ? 'View findings' : 'Open scan'}
        </LinkButton>
        <Button type="button" variant="secondary" onClick={onStartAnother}>
          {startAnotherLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
