import { cn } from '@/lib/cn';
import { formatElapsed } from '@/lib/format';
import type { ScanStatusKey } from '@/lib/labels';

/**
 * The pipeline, made visible.
 *
 * An officer waiting on a scan should be able to see *which* stage is running, not
 * just a spinner. The stages listed here map one-to-one onto the worker's steps in
 * `src/worker/process-scan.ts`, which also makes a failure message far easier to
 * interpret: "extraction" failing means something different from "report" failing.
 */
const STAGES = [
  { key: 'queued', label: 'Queued', detail: 'Waiting for a worker' },
  { key: 'reading', label: 'Reading label', detail: 'Transcribing the declarations' },
  { key: 'rules', label: 'Applying rules', detail: 'Testing each clause of the 2011 Rules' },
  { key: 'report', label: 'Building report', detail: 'Rendering the PDF record' },
] as const;

function stageIndexFor(status: ScanStatusKey, elapsedSeconds: number): number {
  if (status === 'PENDING') return 0;
  if (status === 'COMPLETED' || status === 'FAILED') return STAGES.length;
  // While PROCESSING the worker does not report sub-stage progress, so this is an
  // honest time-based estimate of where it has likely got to — never shown as
  // completed work, only as the stage currently in flight.
  if (elapsedSeconds < 6) return 1;
  if (elapsedSeconds < 14) return 2;
  return 3;
}

export function PipelineProgress({
  status,
  elapsedSeconds,
  className,
}: {
  status: ScanStatusKey;
  elapsedSeconds: number;
  className?: string;
}) {
  const current = stageIndexFor(status, elapsedSeconds);
  const failed = status === 'FAILED';

  return (
    <div className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-body font-medium text-ink">
          {status === 'PENDING'
            ? 'Waiting in the queue'
            : status === 'PROCESSING'
              ? 'Assessing the label'
              : status === 'COMPLETED'
                ? 'Assessment complete'
                : 'Processing failed'}
        </p>
        <p className="font-mono text-label tabular-nums text-ink-muted">
          {formatElapsed(elapsedSeconds)}
        </p>
      </div>

      <ol className="space-y-0">
        {STAGES.map((stage, index) => {
          const done = index < current && !failed;
          const active = index === current && !failed && status !== 'COMPLETED';
          const isLast = index === STAGES.length - 1;

          return (
            <li key={stage.key} className="flex gap-3">
              {/* Marker + connector */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border text-micro font-semibold',
                    done && 'border-compliant bg-compliant text-ink-inverse',
                    active && 'border-brand bg-brand text-ink-inverse',
                    !done && !active && 'border-line-strong bg-surface text-ink-muted',
                  )}
                  aria-hidden="true"
                >
                  {done ? (
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                      <path
                        d="M5.5 10.4l3 3 6-6.8"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : active ? (
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-pill bg-current" />
                  ) : (
                    index + 1
                  )}
                </span>
                {!isLast ? (
                  <span
                    className={cn('my-0.5 w-px flex-1', done ? 'bg-compliant-border' : 'bg-line')}
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              {/* Text */}
              <div className={cn('pb-3.5', isLast && 'pb-0')}>
                <p
                  className={cn(
                    'text-body',
                    active ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {stage.label}
                </p>
                <p className="text-label text-ink-muted">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
