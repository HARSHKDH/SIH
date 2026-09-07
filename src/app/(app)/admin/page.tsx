import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OfficerRoster } from '@/components/admin/officer-roster';
import { RuleStatsTable } from '@/components/admin/rule-stats-table';
import { ScoreDistributionChart } from '@/components/admin/score-distribution-chart';
import { StatCard } from '@/components/dashboard/stat-card';
import { SystemStatusPanel } from '@/components/dashboard/system-status-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ScoreBar } from '@/components/ui/score-gauge';
import { TableWrap, Td, Th } from '@/components/ui/table';
import { getSessionUser } from '@/lib/auth/server';
import { bandForAverageScore } from '@/lib/rules/engine';
import { getAdminStats, listUsers } from '@/lib/queries/admin';

export const metadata: Metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

/**
 * Administration.
 *
 * Two responsibilities, in the order an administrator actually uses them: aggregate
 * violation statistics by rule type (what the department should act on), then account
 * management (who can act). Role is checked here as well as in middleware and in every
 * admin API route — three independent gates, because "the menu item was hidden" is not
 * an access control.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/dashboard');

  const [stats, users] = await Promise.all([getAdminStats(), listUsers()]);

  return (
    <>
      <PageHeader
        title="Administration"
        description="Department-wide violation statistics and officer account management."
      />

      {/* ---- Totals ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Officers"
          value={stats.totals.activeUsers}
          hint={`${stats.totals.users} accounts in total`}
        />
        <StatCard
          label="Scans recorded"
          value={stats.totals.scans}
          hint={`${stats.totals.completedScans} assessed`}
          href="/scans?scope=all"
        />
        <StatCard
          label="Failed scans"
          value={stats.totals.failedScans}
          hint={stats.totals.failedScans > 0 ? 'Retryable from the scan detail page' : 'None outstanding'}
          tone={stats.totals.failedScans > 0 ? 'moderate' : 'compliant'}
          href="/scans?scope=all&status=FAILED"
        />
        <StatCard
          label="Total violations"
          value={stats.totals.violations}
          hint={`${stats.severityBreakdown.critical} critical · ${stats.severityBreakdown.moderate} moderate · ${stats.severityBreakdown.minor} minor`}
          tone={stats.severityBreakdown.critical > 0 ? 'critical' : 'default'}
        />
      </div>

      {/* ---- Violation statistics by rule type ---- */}
      <Card className="mb-5">
        <CardHeader
          title="Violations by rule type"
          description="Every clause breached across the department, ranked by frequency"
          as="h2"
        />
        <RuleStatsTable ruleStats={stats.ruleStats} />
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Score distribution"
            description="Completed scans grouped by compliance band"
            as="h3"
          />
          <div className="px-2 py-3 sm:px-3">
            <ScoreDistributionChart distribution={stats.scoreDistribution} />
          </div>
        </Card>

        <SystemStatusPanel system={stats.system} />
      </div>

      {/* ---- Officer activity ---- */}
      <Card className="mb-5">
        <CardHeader
          title="Officer activity"
          description="Scans recorded and the average compliance score of the packages assessed"
          as="h3"
        />
        {stats.officerActivity.length === 0 ? (
          <EmptyState
            icon="document"
            title="No scans recorded yet"
            description="Officer activity appears here once inspections have been recorded."
            className="py-10"
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Officer</Th>
                <Th align="right">Scans</Th>
                <Th align="right">Violations found</Th>
                <Th align="right">Average score</Th>
              </tr>
            </thead>
            <tbody>
              {stats.officerActivity.map((officer) => (
                <tr key={officer.id}>
                  <Td>
                    <span className="font-medium text-ink">{officer.name}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular-nums text-ink">{officer.scans}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular-nums text-ink-secondary">{officer.violations}</span>
                  </Td>
                  <Td align="right">
                    {officer.averageScore === null ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <ScoreBar
                        score={officer.averageScore}
                        band={bandForAverageScore(officer.averageScore)}
                        className="justify-end"
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* ---- Accounts ---- */}
      <OfficerRoster initialUsers={users} />

      <Card className="mt-5">
        <CardHeader title="Rule book" as="h3" />
        <CardBody>
          <p className="max-w-3xl text-body text-ink-secondary">
            Compliance is decided by {stats.ruleStats.length > 0 ? 'the' : 'a'} fixed set of clause
            functions in <code className="font-mono text-label">src/lib/rules/clauses</code>, each
            mapping to one provision of the Legal Metrology (Packaged Commodities) Rules, 2011. The
            vision model only transcribes what is printed; it takes no part in the compliance
            decision. Adding a clause means writing one function and registering it — there is no
            rule DSL and no database-driven rule table, so every finding traces to reviewable code.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
