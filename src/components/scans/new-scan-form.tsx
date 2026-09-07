'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ScanProgressCard } from '@/components/scans/scan-progress-card';
import { UploadDropzone, type SelectedImage } from '@/components/scans/upload-dropzone';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import type { ScanSummaryDto, UploadTargetDto } from '@/lib/api/dto';
import { errorMessage, HttpError, apiFetch } from '@/lib/http';

type Phase = 'idle' | 'uploading' | 'creating' | 'tracking';

interface CreateScanResponse {
  scan: ScanSummaryDto;
  queued: boolean;
  warning?: string;
  queueError?: string;
}

/**
 * The capture flow, implementing the three-step upload from the brief:
 *
 *   1. POST /api/uploads/presign  -> a presigned (or signed local) PUT target
 *   2. PUT  <uploadUrl>           -> bytes go straight to storage, not through the API
 *   3. POST /api/scans            -> creates the PENDING row and enqueues the job
 *
 * Then it polls the scan until the worker finishes. Step 2 bypassing the Node process
 * is the point of the presign dance: a 10 MB phone photo never occupies an API worker,
 * and swapping the local driver for S3 changes nothing on this screen.
 */
export function NewScanForm() {
  const router = useRouter();

  const [image, setImage] = useState<SelectedImage | null>(null);
  const [productName, setProductName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [queueWarning, setQueueWarning] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);

  const busy = phase === 'uploading' || phase === 'creating';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image) {
      setError('Add a photograph of the label first.');
      return;
    }

    setError(null);
    setQueueWarning(null);

    try {
      // --- 1. Ask for somewhere to put the bytes ---
      setPhase('uploading');
      const target = await apiFetch<UploadTargetDto>('/api/uploads/presign', {
        method: 'POST',
        body: JSON.stringify({
          contentType: image.file.type,
          contentLength: image.file.size,
          productName: productName.trim() || null,
        }),
      });

      // --- 2. Upload straight to storage ---
      const upload = await fetch(target.uploadUrl, {
        method: target.method,
        headers: target.headers,
        body: image.file,
      });

      if (!upload.ok) {
        // S3 answers with XML, the local route with JSON; try for a useful message.
        const detail = await upload
          .clone()
          .json()
          .then((body: unknown) =>
            typeof body === 'object' && body !== null && 'error' in body
              ? (body as { error: { message?: string } }).error?.message
              : undefined,
          )
          .catch(() => undefined);
        throw new HttpError(upload.status, detail ?? `Upload failed (${upload.status}).`);
      }

      // --- 3. Create the scan and enqueue processing ---
      setPhase('creating');
      const created = await apiFetch<CreateScanResponse>('/api/scans', {
        method: 'POST',
        body: JSON.stringify({
          imageKey: target.key,
          productName: productName.trim() || null,
        }),
      });

      if (!created.queued && created.warning) setQueueWarning(created.warning);

      setScanId(created.scan.id);
      setPhase('tracking');
      // Refresh so the dashboard and history counts include this scan when the
      // officer navigates back.
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not submit the scan. Please try again.'));
      setPhase('idle');
    }
  }

  function startAnother() {
    setImage(null);
    setProductName('');
    setScanId(null);
    setPhase('idle');
    setError(null);
    setQueueWarning(null);
  }

  // ---- Tracking view --------------------------------------------------------
  if (phase === 'tracking' && scanId) {
    return (
      <ScanProgressCard
        scanId={scanId}
        queueWarning={queueWarning}
        onStartAnother={startAnother}
      />
    );
  }

  // ---- Capture view ---------------------------------------------------------
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader
          title="Label photograph"
          description="The image becomes part of the inspection record, so capture the whole declaration panel."
        />

        <CardBody className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <UploadDropzone value={image} onChange={setImage} onError={setError} disabled={busy} />

          <Field
            label="Product name"
            hint="Optional. Recorded on the report and used to orient the transcription — it is never treated as evidence that a declaration exists."
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
        </CardBody>

        <CardFooter className="justify-between">
          <p className="text-label text-ink-muted">
            {phase === 'uploading'
              ? 'Uploading photograph\u2026'
              : phase === 'creating'
                ? 'Queueing for assessment\u2026'
                : 'Processing usually takes under a minute.'}
          </p>
          <Button type="submit" loading={busy} disabled={!image}>
            Submit for assessment
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
