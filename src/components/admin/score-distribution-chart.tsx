'use client';

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { bandPalette, palette, type ComplianceBandKey } from '@/lib/design/tokens';
import type { AdminStatsDto } from '@/lib/api/dto';

/**
 * How the department's completed scans distribute across the compliance bands.
 *
 * Horizontal bars, because the category labels are sentences ("Seriously
 * non-compliant (0–49)") and would be unreadable rotated under a vertical axis. Each
 * bar takes the colour of its own band, so the chart reads the same way as the badges
 * everywhere else in the app.
 */
export function ScoreDistributionChart({
  distribution,
}: {
  distribution: AdminStatsDto['scoreDistribution'];
}) {
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center px-6 text-center">
        <p className="text-body text-ink-muted">
          No completed scans yet. The score distribution appears once assessments have run.
        </p>
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={distribution}
          layout="vertical"
          margin={{ top: 4, right: 28, left: 4, bottom: 4 }}
        >
          {/*
            An explicit dataMax domain. Left to `auto`, recharts pads the axis out to
            a round tick and the bars end up as slivers when the counts are small —
            which is exactly the case on a freshly seeded install.
          */}
          <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="label"
            width={168}
            tick={{ fill: palette.inkSecondary, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: palette.brandMuted }}
            contentStyle={{
              borderRadius: 6,
              border: `1px solid ${palette.line}`,
              fontSize: 12,
              padding: '8px 10px',
            }}
            formatter={(value: number) => [`${value} scan${value === 1 ? '' : 's'}`, 'Count']}
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={26}>
            {distribution.map((bucket) => (
              <Cell key={bucket.band} fill={bandPalette[bucket.band as ComplianceBandKey].fg} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fill: palette.ink, fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
