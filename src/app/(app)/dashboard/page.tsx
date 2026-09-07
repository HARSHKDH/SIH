import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StatCard } from '@/components/dashboard/stat-card';
import { SystemStatusPanel } from '@/components/dashboard/system-status-panel';
import { TopViolations } from '@/components/dashboard/top-violations';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { ScanTable } from '@/components/scans/scan-table';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { PageHeader } from '@/components/ui/page-header';
import { getSessionUser } from '@/lib/auth/server';
import { formatPercent, greetingName } from '@/lib/format';
import { getDashboardData } from '@/lib/queries/dashboard';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * Officer home.
 *
 * Rendered entirely on the server: `getDashboardData` runs the same aggregation the
 * JSON API exposes, so there is no loading spinner and no client-side data fetching
 * on the first screen an officer sees each morning.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { stats, recentScans, system } = await getDashboardData(user);
  const isAdmin = user.role === 'ADMIN';

  return (
    <>
      <PageHeader
        title={`Good day, ${greetingName(user.name)}`}
        description={
          isAdmin
            ? 'Department-wide view of every scan recorded by your officers.'
            : 'Your inspection activity and the compliance findings you have recorded.'
        }
        actions={
          <LinkButton href="/scans/new" className="hidden sm:inline-flex">
            Record new scan
          </LinkButton>
        }
      />

      {/* Fixed-mode banner so nobody demos the offline extractor thinking it is live. */}
      {system.extractionMode === 'mock' ? (
        <Alert tone="warning" title="Offline extraction mode" className="mb-5">
          No vision API key is configured, so label transcription uses the built-in deterministic
          extractor. Set <code className="font-mono">GEMINI_API_KEY</code> to read real labels. The
          queue, rule engine, scoring and PDF report all run exactly as they do in production.
        </Alert>
      ) : null}

      {system.queue && !system.queue.reachable ? (
        <Alert tone="error" title="Processing queue unreachable" className="mb-5">
          Redis is not responding, so newly recorded scans will stay queued until it is back. Start
          Redis and run <code className="font-mono">npm run worker</code>, then use Retry on any
          affected scan.
        </Alert>
      ) : null}

      {/* ---- Headline figures ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total scans"
          value={stats.totalScans}
          hint={`${stats.scansThisWeek} in the last 7 days`}
          href="/scans"
        />
        <StatCard
          label="In progress"
          value={stats.pending}
          hint={stats.failed > 0 ? `${stats.failed} failed` : 'Queued and processing'}
          tone={stats.failed > 0 ? 'moderate' : 'default'}
          href="/scans?status=PENDING"
        />
        <StatCard
          label="Violations this week"
          value={stats.violationsThisWeek}
          hint="Findings across all severities"
          tone={stats.violationsThisWeek > 0 ? 'critical' : 'compliant'}
        />
        <StatCard
          label="Compliance rate"
          value={formatPercent(stats.complianceRate)}
          hint={
            stats.completedScans === 0
              ? 'No completed scans yet'
              : `${stats.completedScans} assessed · avg score ${stats.averageScore ?? '—'}`
          }
          tone={
            stats.completedScans === 0
              ? 'default'
              : stats.complianceRate >= 70
                ? 'compliant'
                : stats.complianceRate >= 40
                  ? 'moderate'
                  : 'critical'
          }
        />
      </div>

      {/* ---- Trend + system ---- */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Activity, last 7 days"
            description="Scans recorded against violations found"
            as="h3"
          />
          <div className="px-2 py-3 sm:px-3">
            <TrendChart data={stats.trend} />
          </div>
        </Card>

        <SystemStatusPanel system={system} />
      </div>

      {/* ---- Recent scans + top clauses ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent scans"
            description={isAdmin ? 'Latest across the department' : 'Your latest inspections'}
            as="h3"
            actions={
              <Link
                href="/scans"
                className="text-label font-medium text-brand hover:text-brand-hover hover:underline"
              >
                View all
              </Link>
            }
          />
          <ScanTable
            scans={recentScans}
            showOfficer={isAdmin}
            emptyTitle="No scans recorded yet"
            emptyDescription="Photograph a package label to run it against the Packaged Commodities Rules."
            emptyAction={<LinkButton href="/scans/new">Record new scan</LinkButton>}
          />
        </Card>

        <TopViolations items={stats.topViolations} />
      </div>

      {/* Mobile-only primary action, kept in thumb reach. */}
      <div className="mt-5 sm:hidden">
        <LinkButton href="/scans/new" size="lg" fullWidth>
          Record new scan
        </LinkButton>
      </div>
    </>
  );
}
