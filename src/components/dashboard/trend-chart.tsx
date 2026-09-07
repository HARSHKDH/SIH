'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { palette } from '@/lib/design/tokens';
import { formatDayLabel } from '@/lib/format';

export interface TrendPoint {
  date: string;
  scans: number;
  violations: number;
}

/**
 * Seven-day activity.
 *
 * Grouped bars rather than an area chart: these are counts of discrete events, and
 * a smoothed area would imply a continuous quantity that does not exist. Grid lines
 * are horizontal only and set in the divider colour, so the data carries the visual
 * weight.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const hasData = data.some((point) => point.scans > 0 || point.violations > 0);

  if (!hasData) {
    return (
      <div className="flex h-52 items-center justify-center px-6 text-center">
        <p className="text-body text-ink-muted">
          No scans recorded in the last seven days. Activity will appear here once scans are
          processed.
        </p>
      </div>
    );
  }

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={3}>
          <CartesianGrid stroke={palette.line} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayLabel}
            tick={{ fill: palette.inkMuted, fontSize: 11 }}
            axisLine={{ stroke: palette.line }}
            tickLine={false}
            dy={4}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: palette.inkMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: palette.brandMuted }}
            labelFormatter={(value) => formatDayLabel(String(value))}
            contentStyle={{
              borderRadius: 6,
              border: `1px solid ${palette.line}`,
              boxShadow: '0 8px 24px -6px rgba(26, 32, 44, 0.18)',
              fontSize: 12,
              padding: '8px 10px',
            }}
            labelStyle={{ color: palette.ink, fontWeight: 600, marginBottom: 4 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={26}
            iconType="square"
            iconSize={9}
            wrapperStyle={{ fontSize: 11, color: palette.inkSecondary }}
          />
          <Bar dataKey="scans" name="Scans" fill={palette.brand} radius={[2, 2, 0, 0]} maxBarSize={22} />
          <Bar
            dataKey="violations"
            name="Violations"
            fill={palette.moderate}
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
