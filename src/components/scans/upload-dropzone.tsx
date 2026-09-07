'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CameraIcon, CloseIcon, UploadIcon } from '@/components/layout/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

/** Kept in step with `ALLOWED_IMAGE_TYPES` and `MAX_IMAGE_BYTES` on the server. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED.join(',');
const MAX_BYTES = 12 * 1024 * 1024;

export interface SelectedImage {
  file: File;
  previewUrl: string;
}

/**
 * Label photograph picker.
 *
 * Two entry points, because officers work in two modes: drag-and-drop at a desk, and
 * the rear camera in a shop. `capture="environment"` on a second hidden input is what
 * makes the phone open straight to the back camera instead of the gallery — the
 * distinction matters when someone is standing in front of a shelf.
 *
 * Type and size are checked here as well as on the server. Client-side validation is
 * a courtesy (instant feedback, no wasted upload on mobile data), never the
 * safeguard — `/api/uploads/local` re-checks the magic bytes regardless.
 */
export function UploadDropzone({
  value,
  onChange,
  onError,
  disabled = false,
}: {
  value: SelectedImage | null;
  onChange: (image: SelectedImage | null) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Object URLs are a real leak if left dangling; release the previous one whenever
  // the selection changes and on unmount.
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    previewRef.current = value?.previewUrl ?? null;
  }, [value]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;

      if (!ACCEPTED.includes(file.type)) {
        onError('Upload a JPEG, PNG or WebP photograph. HEIC images cannot be read — export as JPEG first.');
        return;
      }
      if (file.size > MAX_BYTES) {
        onError(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
        return;
      }
      if (file.size === 0) {
        onError('That file is empty.');
        return;
      }

      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      onError(null);
      onChange({ file, previewUrl: URL.createObjectURL(file) });
    },
    [onChange, onError, value],
  );

  function clear() {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    onError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  // ---- Selected state -------------------------------------------------------
  if (value) {
    return (
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center justify-center bg-canvas p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, not an optimisable asset */}
          <img
            src={value.previewUrl}
            alt="Preview of the label photograph selected for assessment"
            className="max-h-72 w-auto rounded-control object-contain"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-ink">{value.file.name}</p>
            <p className="text-label text-ink-muted">
              {formatBytes(value.file.size)} · {value.file.type.replace('image/', '').toUpperCase()}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={disabled}
            className="shrink-0"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>
    );
  }

  // ---- Empty state ----------------------------------------------------------
  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) accept(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'rounded-card border-2 border-dashed px-5 py-8 text-center transition-colors sm:py-10',
          dragging ? 'border-brand-hover bg-brand-muted' : 'border-line-strong bg-surface-muted',
          disabled && 'opacity-60',
        )}
      >
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-pill bg-brand-muted text-brand">
          <UploadIcon className="h-5 w-5" />
        </span>

        <p className="text-body-lg font-medium text-ink">Add a photograph of the label</p>
        <p className="mx-auto mt-1 max-w-sm text-balance text-body text-ink-secondary">
          Frame the panel square-on in even light, with every mandatory declaration inside the
          frame.
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {/* Camera first on mobile: it is the primary action in the field. */}
          <Button
            type="button"
            variant="primary"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            className="w-full sm:hidden"
            size="lg"
          >
            <CameraIcon className="h-4 w-4" />
            Take photo
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="w-full sm:w-auto"
          >
            <UploadIcon className="h-4 w-4" />
            Choose a file
          </Button>
          <span className="hidden text-label text-ink-muted sm:inline">or drop it here</span>
        </div>

        <p className="mt-4 text-label text-ink-muted">
          JPEG, PNG or WebP · up to {formatBytes(MAX_BYTES)}
        </p>
      </div>

      {/* Gallery / file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => accept(event.target.files?.[0])}
      />
      {/* Rear camera on a phone */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => accept(event.target.files?.[0])}
      />
    </div>
  );
}
