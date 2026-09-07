'use client';

import { useRef, useState } from 'react';

import {
  CameraIcon,
  DocumentIcon,
  PaperclipIcon,
  TrashIcon,
  UploadIcon,
} from '@/components/layout/icons';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardBody, CardFooter } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import type { AttachmentDto, ScanDetailDto, UploadTargetDto } from '@/lib/api/dto';
import { formatBytes, formatDateTime } from '@/lib/format';
import { apiFetch, errorMessage, HttpError } from '@/lib/http';

/**
 * Kept in step with `ALLOWED_ATTACHMENT_TYPES`, `MAX_ATTACHMENT_BYTES` and
 * `MAX_ATTACHMENTS_PER_SCAN` on the server. Checking here is a courtesy — instant
 * feedback and no wasted upload on mobile data — never the safeguard.
 */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ACCEPT_ATTR = ACCEPTED.join(',');
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 10;

interface MutationResponse {
  scan: ScanDetailDto;
  reportInvalidated: boolean;
}

/**
 * Supporting evidence for an inspection.
 *
 * The label photograph is the subject of the assessment; this is everything that
 * corroborates it — a second angle showing a declaration the first frame cut off, a
 * shelf photograph proving the goods were offered for sale, an invoice or a test
 * certificate as PDF. Rule 6 findings are made against the pack, but an enforcement
 * file has to stand on its own months later, which is what the caption is for: it
 * records what a reader is supposed to notice in the file.
 *
 * Upload reuses the same three-step flow as the label photograph (presign, PUT
 * straight at storage, then record), so a 15 MB scanned PDF never occupies an API
 * worker and the S3 swap changes nothing here.
 */
export function AttachmentPanel({
  scan,
  readOnly = false,
  onChanged,
}: {
  scan: ScanDetailDto;
  readOnly?: boolean;
  onChanged?: (scan: ScanDetailDto) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const attachments = scan.attachments;
  const atCapacity = attachments.length >= MAX_FILES;

  function resetInputs() {
    setFile(null);
    setCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  function select(chosen: File | undefined) {
    if (!chosen) return;
    if (!ACCEPTED.includes(chosen.type)) {
      setError('Attach a JPEG, PNG or WebP photograph, or a PDF document.');
      return;
    }
    if (chosen.size === 0) {
      setError('That file is empty.');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(chosen.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setError(null);
    setNotice(null);
    setFile(chosen);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      // 1. Ask for somewhere to put the bytes. Authorisation is checked here, so a
      //    refusal costs nothing.
      const target = await apiFetch<UploadTargetDto>(
        `/api/scans/${scan.id}/attachments/presign`,
        {
          method: 'POST',
          body: JSON.stringify({
            contentType: file.type,
            contentLength: file.size,
            fileName: file.name,
          }),
        },
      );

      // 2. Straight to storage, bypassing the API process.
      const put = await fetch(target.uploadUrl, {
        method: target.method,
        headers: target.headers,
        body: file,
      });
      if (!put.ok) {
        const detail = await put
          .clone()
          .json()
          .then((body: unknown) =>
            typeof body === 'object' && body !== null && 'error' in body
              ? (body as { error: { message?: string } }).error?.message
              : undefined,
          )
          .catch(() => undefined);
        throw new HttpError(put.status, detail ?? `Upload failed (${put.status}).`);
      }

      // 3. Record it. The server re-reads the object and re-sniffs its type.
      const result = await apiFetch<MutationResponse>(`/api/scans/${scan.id}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          fileKey: target.key,
          fileName: file.name,
          caption: caption.trim() || null,
        }),
      });

      resetInputs();
      onChanged?.(result.scan);
      setNotice(
        result.reportInvalidated
          ? 'Evidence attached. The stored PDF was discarded and will be rebuilt on next download.'
          : 'Evidence attached.',
      );
    } catch (caught) {
      setError(errorMessage(caught, 'Could not attach that file.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(attachment: AttachmentDto) {
    setRemovingId(attachment.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<MutationResponse>(
        `/api/scans/${scan.id}/attachments/${attachment.id}`,
        { method: 'DELETE' },
      );
      onChanged?.(result.scan);
      setNotice(
        result.reportInvalidated
          ? 'Evidence withdrawn. The stored PDF was discarded and will be rebuilt on next download.'
          : 'Evidence withdrawn.',
      );
    } catch (caught) {
      setError(errorMessage(caught, 'Could not remove that attachment.'));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <CardBody className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        {attachments.length === 0 ? (
          <p className="text-body italic text-ink-muted">
            {readOnly
              ? 'No supporting evidence was attached to this inspection.'
              : 'No supporting evidence yet. Attach a second angle of the pack, a shelf photograph, or an invoice.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                <a
                  href={attachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  aria-label={`Open ${attachment.fileName} in a new tab`}
                >
                  {attachment.isImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- authenticated /api/files route, not an optimisable static asset */
                    <img
                      src={attachment.fileUrl}
                      alt={attachment.caption ?? `Supporting evidence: ${attachment.fileName}`}
                      className="h-14 w-14 rounded-control border border-line bg-canvas object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-control border border-line bg-surface-muted text-ink-muted">
                      <DocumentIcon className="h-5 w-5" />
                    </span>
                  )}
                </a>

                <div className="min-w-0 flex-1">
                  <a
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-body font-medium text-ink hover:text-brand hover:underline"
                  >
                    {attachment.fileName}
                  </a>
                  {attachment.caption ? (
                    <p className="mt-0.5 text-label text-ink-secondary">{attachment.caption}</p>
                  ) : (
                    <p className="mt-0.5 text-label italic text-ink-muted">No description given</p>
                  )}
                  <p className="mt-0.5 text-micro text-ink-muted">
                    {attachment.kind === 'DOCUMENT' ? 'Document' : 'Photograph'} ·{' '}
                    {formatBytes(attachment.byteSize)} · {formatDateTime(attachment.createdAt)}
                  </p>
                </div>

                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => remove(attachment)}
                    loading={removingId === attachment.id}
                    disabled={busy || removingId !== null}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">Remove</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {readOnly ? (
          <p className="text-label text-ink-muted">
            Only the officer who recorded this scan can attach or withdraw evidence.
          </p>
        ) : (
          <div className="space-y-3 border-t border-line pt-3">
            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface-muted px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{file.name}</p>
                  <p className="text-label text-ink-muted">
                    {formatBytes(file.size)} ·{' '}
                    {file.type === 'application/pdf' ? 'PDF document' : 'Photograph'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetInputs}
                  disabled={busy}
                  className="shrink-0"
                >
                  Clear
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy || atCapacity}
                  className="w-full sm:hidden"
                >
                  <CameraIcon className="h-4 w-4" />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || atCapacity}
                  className="w-full sm:w-auto"
                >
                  <UploadIcon className="h-4 w-4" />
                  Choose a file
                </Button>
                <p className="self-center text-label text-ink-muted">
                  {atCapacity
                    ? `Limit of ${MAX_FILES} reached. Remove one to add another.`
                    : `JPEG, PNG, WebP or PDF · up to ${formatBytes(MAX_BYTES)}`}
                </p>
              </div>
            )}

            {file ? (
              <Field
                label="What does this evidence show?"
                hint="Optional, but it is what makes the file usable to someone reading the case file later. Listed in both reports."
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={caption}
                    onChange={(event) => setCaption(event.target.value.slice(0, 500))}
                    maxLength={500}
                    disabled={busy}
                    placeholder="e.g. Reverse panel showing the consumer care details cut off in the main photograph"
                  />
                )}
              </Field>
            ) : null}
          </div>
        )}
      </CardBody>

      {readOnly ? null : (
        <CardFooter className="justify-between">
          <p className="text-label text-ink-muted">
            {attachments.length === 0
              ? 'Nothing attached.'
              : `${attachments.length} of ${MAX_FILES} attached.`}
          </p>
          <Button type="button" onClick={upload} loading={busy} disabled={!file}>
            <PaperclipIcon className="h-4 w-4" />
            Attach evidence
          </Button>
        </CardFooter>
      )}

      {/* File picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => select(event.target.files?.[0])}
      />
      {/* Rear camera on a phone — officers attach second angles standing at the shelf. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => select(event.target.files?.[0])}
      />
    </>
  );
}
