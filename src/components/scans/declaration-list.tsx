'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { DeclarationDto } from '@/lib/api/dto';
import type { DeclarationKey } from '@/lib/extraction/schema';
import { formatConfidence, formatMillimetres } from '@/lib/format';

/**
 * The seven mandatory declarations, as transcribed.
 *
 * Two things are deliberate here. First, an absent declaration says "not declared on
 * this label" rather than showing an empty cell — absence is the finding, and it
 * should read as a deliberate observation. Second, confidence is shown for every
 * reading, and a low one is called out, because a 44%-confidence transcription is
 * something an officer must verify by hand before acting on it.
 */
const LOW_CONFIDENCE = 0.65;

export function DeclarationList({
  declarations,
  highlighted,
  onHighlight,
}: {
  declarations: DeclarationDto[];
  highlighted?: DeclarationKey | null;
  onHighlight?: (key: DeclarationKey | null) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {declarations.map((declaration) => {
        const present = Boolean(declaration.valueFound);
        const lowConfidence = present && declaration.confidence < LOW_CONFIDENCE;
        const active = highlighted === declaration.key;

        return (
          <li
            key={declaration.id}
            onMouseEnter={() => onHighlight?.(declaration.key)}
            onMouseLeave={() => onHighlight?.(null)}
            className={cn(
              'px-4 py-3 transition-colors sm:px-5',
              active && 'bg-brand-muted',
              declaration.boundingBox && onHighlight && 'cursor-help',
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">{declaration.label}</p>
                <p className="mt-0.5 font-mono text-micro text-ink-muted">{declaration.ruleRef}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {present ? (
                  <Badge tone="compliant">Declared</Badge>
                ) : (
                  <Badge tone="critical">Not found</Badge>
                )}
              </div>
            </div>

            {present ? (
              <>
                <p className="mt-2 whitespace-pre-wrap break-words text-body text-ink">
                  {declaration.valueFound}
                </p>

                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-micro uppercase tracking-wider text-ink-muted">
                      Confidence
                    </dt>
                    <dd
                      className={cn(
                        'text-label font-semibold tabular-nums',
                        lowConfidence ? 'text-moderate' : 'text-ink-secondary',
                      )}
                    >
                      {formatConfidence(declaration.confidence)}
                    </dd>
                  </div>

                  {declaration.fontSizeEst !== null ? (
                    <div className="flex items-baseline gap-1.5">
                      <dt className="text-micro uppercase tracking-wider text-ink-muted">
                        Est. height
                      </dt>
                      <dd
                        className={cn(
                          'text-label font-semibold tabular-nums',
                          declaration.fontSizeEst < 1 ? 'text-critical' : 'text-ink-secondary',
                        )}
                      >
                        {formatMillimetres(declaration.fontSizeEst)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {lowConfidence ? (
                  <p className="mt-2 rounded-control border-l-2 border-moderate bg-moderate-soft px-2.5 py-1.5 text-label text-moderate">
                    Low confidence reading — verify this declaration on the package before relying
                    on it.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-body italic text-ink-muted">
                No such declaration was read on this label.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
