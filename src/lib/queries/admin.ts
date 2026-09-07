import type { AdminStatsDto, AdminUserDto, RuleStatDto, ViolationCountsDto } from '@/lib/api/dto';
import { adminUserSelect, toAdminUser } from '@/lib/api/serializers';
import { getSystemStatus } from '@/lib/api/system-status';
import { bandPalette, type ComplianceBandKey } from '@/lib/design/tokens';
import { prisma } from '@/lib/prisma';
import { RULE_CLAUSE_BY_CODE } from '@/lib/rules/registry';
import type { RuleSeverity } from '@/lib/rules/types';

/** Admin reads, shared by the admin page and the admin API routes. */

export async function listUsers(): Promise<AdminUserDto[]> {
  const users = await prisma.user.findMany({
    // Active accounts first, then in creation order, so the roster stays stable
    // instead of reshuffling every time someone is edited.
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: adminUserSelect,
  });
  return users.map(toAdminUser);
}

/** Score bands, mirroring the thresholds used on the scan detail screen. */
const SCORE_BUCKETS: Array<{ band: ComplianceBandKey; min: number; max: number }> = [
  { band: 'COMPLIANT', min: 90, max: 100 },
  { band: 'MINOR_ISSUES', min: 70, max: 89 },
  { band: 'NON_COMPLIANT', min: 50, max: 69 },
  { band: 'SERIOUS', min: 0, max: 49 },
];

/**
 * Department-wide aggregates.
 *
 * The question this is built to answer is "which clause is failing most often?",
 * because that is what tells an enforcement department where to direct a drive.
 * Grouping is pushed into Postgres rather than pulled into Node.
 */
export async function getAdminStats(): Promise<AdminStatsDto> {
  const [
    users,
    activeUsers,
    scans,
    completedScans,
    failedScans,
    violations,
    severityGroups,
    ruleGroups,
    scoreCounts,
    officers,
    system,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.scan.count(),
    prisma.scan.count({ where: { status: 'COMPLETED' } }),
    prisma.scan.count({ where: { status: 'FAILED' } }),
    prisma.violation.count(),
    prisma.violation.groupBy({ by: ['severity'], _count: { severity: true } }),
    prisma.violation.groupBy({ by: ['ruleCode', 'severity'], _count: { _all: true } }),
    Promise.all(
      SCORE_BUCKETS.map((bucket) =>
        prisma.scan.count({
          where: {
            status: 'COMPLETED',
            complianceScore: { gte: bucket.min, lte: bucket.max },
          },
        }),
      ),
    ),
    prisma.user.findMany({
      where: { scans: { some: {} } },
      select: {
        id: true,
        name: true,
        _count: { select: { scans: true } },
        scans: {
          where: { status: 'COMPLETED' },
          select: { complianceScore: true, _count: { select: { violations: true } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    getSystemStatus(),
  ]);

  const severityBreakdown: ViolationCountsDto = {
    critical: severityCount(severityGroups, 'CRITICAL'),
    moderate: severityCount(severityGroups, 'MODERATE'),
    minor: severityCount(severityGroups, 'MINOR'),
    total: violations,
  };

  // Fold the (ruleCode × severity) grid into one row per clause.
  const byRule = new Map<string, ViolationCountsDto>();
  for (const group of ruleGroups) {
    const entry = byRule.get(group.ruleCode) ?? { critical: 0, moderate: 0, minor: 0, total: 0 };
    const count = group._count._all;
    if (group.severity === 'CRITICAL') entry.critical += count;
    else if (group.severity === 'MODERATE') entry.moderate += count;
    else entry.minor += count;
    entry.total += count;
    byRule.set(group.ruleCode, entry);
  }

  const ruleStats: RuleStatDto[] = [...byRule.entries()]
    .map(([ruleCode, breakdown]) => {
      const clause = RULE_CLAUSE_BY_CODE[ruleCode];
      return {
        ruleCode,
        ruleTitle: clause?.title ?? ruleCode,
        reference: clause?.reference ?? 'Reference unavailable for this rule code.',
        count: breakdown.total,
        share: violations === 0 ? 0 : Math.round((breakdown.total / violations) * 1000) / 10,
        severityBreakdown: breakdown,
      };
    })
    .sort((a, b) => b.count - a.count);

  const officerActivity = officers.map((officer) => {
    const scored = officer.scans.filter(
      (scan): scan is { complianceScore: number; _count: { violations: number } } =>
        scan.complianceScore !== null,
    );

    return {
      id: officer.id,
      name: officer.name,
      scans: officer._count.scans,
      averageScore:
        scored.length === 0
          ? null
          : Math.round(scored.reduce((sum, scan) => sum + scan.complianceScore, 0) / scored.length),
      violations: officer.scans.reduce((sum, scan) => sum + scan._count.violations, 0),
    };
  });

  return {
    totals: { users, activeUsers, scans, completedScans, failedScans, violations },
    severityBreakdown,
    ruleStats,
    scoreDistribution: SCORE_BUCKETS.map((bucket, index) => ({
      band: bucket.band,
      label: `${bandPalette[bucket.band].label} (${bucket.min}\u2013${bucket.max})`,
      count: scoreCounts[index],
    })),
    officerActivity,
    system,
  };
}

function severityCount(
  groups: Array<{ severity: RuleSeverity; _count: { severity: number } }>,
  severity: RuleSeverity,
): number {
  return groups.find((group) => group.severity === severity)?._count.severity ?? 0;
}
