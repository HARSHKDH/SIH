import type { DashboardDto, DashboardStatsDto } from '@/lib/api/dto';
import { scanOwnershipFilter } from '@/lib/api/scan-access';
import { scanSummarySelect, toScanSummary } from '@/lib/api/serializers';
import { getSystemStatus } from '@/lib/api/system-status';
import type { SessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { RULE_CLAUSE_BY_CODE } from '@/lib/rules/registry';

/**
 * Dashboard aggregates.
 *
 * Lives here rather than inside the route handler so the server-rendered
 * dashboard page and `GET /api/stats/dashboard` (used by the PWA and any future
 * mobile client) execute exactly the same query. Two copies of "compliance rate"
 * would eventually disagree, and a compliance figure that depends on which screen
 * you look at is worse than no figure.
 */

const TREND_DAYS = 7;

export async function getDashboardData(user: SessionUser): Promise<DashboardDto> {
  const scope = user.role === 'ADMIN' ? 'all' : 'mine';
  const where = scanOwnershipFilter(user, scope);

  const startOfWeek = startOfDayUtc(new Date());
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - (TREND_DAYS - 1));

  const [
    totalScans,
    pending,
    processing,
    failed,
    completedScans,
    scoreAggregate,
    scansThisWeek,
    violationsThisWeek,
    cleanCompletedCount,
    recentRows,
    weekScans,
    weekViolations,
    topViolationGroups,
    system,
  ] = await Promise.all([
    prisma.scan.count({ where }),
    prisma.scan.count({ where: { ...where, status: 'PENDING' } }),
    prisma.scan.count({ where: { ...where, status: 'PROCESSING' } }),
    prisma.scan.count({ where: { ...where, status: 'FAILED' } }),
    prisma.scan.count({ where: { ...where, status: 'COMPLETED' } }),
    prisma.scan.aggregate({
      where: { ...where, status: 'COMPLETED', complianceScore: { not: null } },
      _avg: { complianceScore: true },
    }),
    prisma.scan.count({ where: { ...where, createdAt: { gte: startOfWeek } } }),
    prisma.violation.count({ where: { scan: where, createdAt: { gte: startOfWeek } } }),
    // The headline compliance rate counts a package as compliant when it has no
    // critical and no moderate findings. Minor drafting defects (a missing
    // "inclusive of all taxes", an undeclared unit price) are recorded and shown,
    // but they do not make a package non-compliant.
    prisma.scan.count({
      where: {
        ...where,
        status: 'COMPLETED',
        violations: { none: { severity: { in: ['CRITICAL', 'MODERATE'] } } },
      },
    }),
    prisma.scan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: scanSummarySelect,
    }),
    prisma.scan.findMany({
      where: { ...where, createdAt: { gte: startOfWeek } },
      select: { createdAt: true },
    }),
    prisma.violation.findMany({
      where: { scan: where, createdAt: { gte: startOfWeek } },
      select: { createdAt: true },
    }),
    prisma.violation.groupBy({
      by: ['ruleCode'],
      where: { scan: where },
      _count: { ruleCode: true },
      orderBy: { _count: { ruleCode: 'desc' } },
      take: 5,
    }),
    getSystemStatus(),
  ]);

  const stats: DashboardStatsDto = {
    totalScans,
    pending: pending + processing,
    failed,
    violationsThisWeek,
    complianceRate:
      completedScans === 0 ? 0 : Math.round((cleanCompletedCount / completedScans) * 100),
    averageScore:
      scoreAggregate._avg.complianceScore === null
        ? null
        : Math.round(scoreAggregate._avg.complianceScore),
    completedScans,
    scansThisWeek,
    trend: buildTrend(startOfWeek, weekScans, weekViolations),
    topViolations: topViolationGroups.map((group) => ({
      ruleCode: group.ruleCode,
      ruleTitle: RULE_CLAUSE_BY_CODE[group.ruleCode]?.title ?? group.ruleCode,
      count: group._count.ruleCode,
    })),
  };

  return {
    stats,
    recentScans: recentRows.map((row) => toScanSummary(row, { includeOfficer: scope === 'all' })),
    system,
  };
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Buckets the week's rows by day in a single pass. Seven `count` queries would be
 * seven round trips for data that fits comfortably in memory.
 */
function buildTrend(
  from: Date,
  scans: Array<{ createdAt: Date }>,
  violations: Array<{ createdAt: Date }>,
): DashboardStatsDto['trend'] {
  const buckets = new Map<string, { scans: number; violations: number }>();

  for (let index = 0; index < TREND_DAYS; index += 1) {
    const day = new Date(from);
    day.setUTCDate(day.getUTCDate() + index);
    buckets.set(day.toISOString().slice(0, 10), { scans: 0, violations: 0 });
  }

  for (const row of scans) {
    const bucket = buckets.get(row.createdAt.toISOString().slice(0, 10));
    if (bucket) bucket.scans += 1;
  }
  for (const row of violations) {
    const bucket = buckets.get(row.createdAt.toISOString().slice(0, 10));
    if (bucket) bucket.violations += 1;
  }

  return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
}
