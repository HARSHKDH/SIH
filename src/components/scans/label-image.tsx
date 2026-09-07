'use client';

import { useState } from 'react';

import { palette } from '@/lib/design/tokens';
import { cn } from '@/lib/cn';
import type { DeclarationDto } from '@/lib/api/dto';
import type { DeclarationKey } from '@/lib/extraction/schema';

/**
 * The label photograph, with the transcription overlaid on it.
 *
 * This is where the extraction stops being a claim and becomes evidence: the model
 * returns a normalised bounding box for every declaration it read, so an officer can
 * point at the pixels behind any finding. Hovering a row in the declarations table
 * highlights the corresponding region, which is the fastest way to sanity-check a
 * reading before signing a report.
 *
 * Boxes are positioned in percentages because the coordinates are normalised 0–1, so
 * the overlay tracks the image at any rendered size without JavaScript measurement.
 */
export function LabelImage({
  imageUrl,
  declarations,
  highlighted,
  onHighlight,
  className,
}: {
  imageUrl: string;
  declarations: DeclarationDto[];
  highlighted: DeclarationKey | null;
  onHighlight?: (key: DeclarationKey | null) => void;
  className?: string;
}) {
  const [showBoxes, setShowBoxes] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const boxed = declarations.filter((declaration) => declaration.boundingBox !== null);

  return (
    <div className={cn('overflow-hidden rounded-card border border-line bg-surface', className)}>
      <div className="relative flex items-center justify-center bg-canvas">
        {failed ? (
          <div className="flex h-56 items-center justify-center px-6 text-center">
            <p className="text-body text-ink-muted">
              The label photograph could not be loaded. It may have been removed from storage.
            </p>
          </div>
        ) : (
          <>
            {!loaded ? (
              <div className="absolute inset-0 animate-pulse-soft bg-line/40" aria-hidden="true" />
            ) : null}

            {/* Wrapper is inline-block so the overlay matches the image box exactly. */}
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated route, not a static asset */}
              <img
                src={imageUrl}
                alt="Photograph of the package label assessed in this scan"
                className="block max-h-[30rem] w-auto max-w-full"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />

              {showBoxes && loaded
                ? boxed.map((declaration) => {
                    const box = declaration.boundingBox!;
                    const active = highlighted === declaration.key;

                    return (
                      <button
                        key={declaration.id}
                        type="button"
                        onMouseEnter={() => onHighlight?.(declaration.key)}
                        onMouseLeave={() => onHighlight?.(null)}
                        onFocus={() => onHighlight?.(declaration.key)}
                        onBlur={() => onHighlight?.(null)}
                        aria-label={`${declaration.label} on the label`}
                        className="absolute cursor-help transition-all duration-150"
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`,
                          border: `1.5px solid ${active ? palette.brandHover : 'rgba(30, 58, 95, 0.55)'}`,
                          backgroundColor: active ? 'rgba(44, 82, 130, 0.18)' : 'transparent',
                          borderRadius: 2,
                        }}
                      >
                        {active ? (
                          <span
                            className="pointer-events-none absolute -top-1 left-0 max-w-[14rem] -translate-y-full truncate rounded-sm px-1.5 py-0.5 text-micro font-semibold text-ink-inverse"
                            style={{ backgroundColor: palette.brandHover }}
                          >
                            {declaration.label}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                : null}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <p className="text-label text-ink-muted">
          {boxed.length > 0
            ? `${boxed.length} of ${declarations.length} declarations located on the image`
            : 'No positions were recorded for this scan'}
        </p>

        {boxed.length > 0 ? (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-label text-ink-secondary">
            <input
              type="checkbox"
              checked={showBoxes}
              onChange={(event) => setShowBoxes(event.target.checked)}
              className="h-4 w-4 rounded-sm border-line-strong text-brand accent-brand"
            />
            Show regions
          </label>
        ) : null}
      </div>
    </div>
  );
}
