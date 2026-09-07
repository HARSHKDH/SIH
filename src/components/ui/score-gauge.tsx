import { bandPalette, palette } from '@/lib/design/tokens';
import { cn } from '@/lib/cn';
import type { ComplianceBand } from '@/lib/rules/engine';

/**
 * The compliance score, drawn as an SVG ring.
 *
 * SVG rather than a conic-gradient div because this renders on the server with no
 * client JS, prints correctly, and scales cleanly on a high-DPI phone. The colour
 * follows the *band*, not the number, so a package with a critical violation reads
 * as brick red even at 84/100.
 */
export function ScoreGauge({
  score,
  band,
  size = 'md',
  className,
}: {
  score: number;
  band: ComplianceBand;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dimensions = {
    sm: { box: 56, stroke: 5, value: 'text-h3', unit: 'text-[9px]' },
    md: { box: 88, stroke: 7, value: 'text-stat', unit: 'text-micro' },
    lg: { box: 120, stroke: 9, value: 'text-[2.25rem] leading-none', unit: 'text-label' },
  }[size];

  const colour = bandPalette[band].fg;
  const radius = (dimensions.box - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: dimensions.box, height: dimensions.box }}
      role="img"
      aria-label={`Compliance score ${clamped} out of 100 — ${bandPalette[band].label}`}
    >
      <svg
        width={dimensions.box}
        height={dimensions.box}
        viewBox={`0 0 ${dimensions.box} ${dimensions.box}`}
        aria-hidden="true"
      >
        {/* Rotated so the arc starts at 12 o'clock and sweeps clockwise. */}
        <g transform={`rotate(-90 ${dimensions.box / 2} ${dimensions.box / 2})`}>
          <circle
            cx={dimensions.box / 2}
            cy={dimensions.box / 2}
            r={radius}
            fill="none"
            stroke={palette.line}
            strokeWidth={dimensions.stroke}
          />
          <circle
            cx={dimensions.box / 2}
            cy={dimensions.box / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={dimensions.stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-semibold tabular-nums', dimensions.value)} style={{ color: colour }}>
          {clamped}
        </span>
        <span className={cn('font-medium uppercase tracking-wider text-ink-muted', dimensions.unit)}>
          / 100
        </span>
      </div>
    </div>
  );
}

/**
 * A slim horizontal meter, for table rows where a ring would be too heavy.
 */
export function ScoreBar({
  score,
  band,
  className,
}: {
  score: number;
  band: ComplianceBand;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-7 shrink-0 text-right text-body font-semibold tabular-nums text-ink">
        {clamped}
      </span>
      <span
        className="h-1.5 w-14 overflow-hidden rounded-pill bg-line"
        role="img"
        aria-label={`Score ${clamped} of 100`}
      >
        <span
          className="block h-full rounded-pill"
          style={{ width: `${clamped}%`, backgroundColor: bandPalette[band].fg }}
        />
      </span>
    </div>
  );
}
