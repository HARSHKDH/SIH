import { Prisma } from '@prisma/client';

import type { ScanDetailDto, ScanListDto } from '@/lib/api/dto';
import { ApiError } from '@/lib/api/errors';
import { assertCanAccessScan, scanOwnershipFilter } from '@/lib/api/scan-access';
import type { ScanListQuery } from '@/lib/api/schemas';
import { scanDetailSelect, scanSummarySelect, toScanDetail, toScanSummary } from '@/lib/api/serializers';
import type { SessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

/**
 * Scan reads, shared by the server-rendered pages and the JSON API.
 */

export function buildScanWhere(user: SessionUser, query: ScanListQuery): Prisma.ScanWhereInput {
  const where: Prisma.ScanWhereInput = { ...scanOwnershipFilter(user, query.scope) };

  if (query.officerId) {
    if (user.role !== 'ADMIN' && query.officerId !== user.id) {
      throw ApiError.forbidden('You can only filter your own scans.');
    }
    where.userId = query.officerId;
  }

  if (query.search) {
    where.productName = { contains: query.search, mode: 'insensitive' };
  }

  if (query.status) where.status = query.status;

  if (query.minScore !== undefined || query.maxScore !== undefined) {
    where.complianceScore = {
      ...(query.minScore !== undefined ? { gte: query.minScore } : {}),
      ...(query.maxScore !== undefined ? { lte: query.maxScore } : {}),
    };
  }

  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}),
    };
  }

  // "Has at least one finding of this severity" — expressed as a relation filter
  // so Postgres does the work instead of Node over-fetching and filtering.
  if (query.severity) {
    where.violations = { some: { severity: query.severity } };
  }

  return where;
}

function buildScanOrderBy(query: ScanListQuery): Prisma.ScanOrderByWithRelationInput {
  if (query.sort === 'complianceScore') {
    // Unscored scans sort last in either direction — a pending scan is not the
    // "lowest scoring" one.
    return { complianceScore: { sort: query.direction, nulls: 'last' } };
  }
  if (query.sort === 'productName') {
    return { productName: { sort: query.direction, nulls: 'last' } };
  }
  return { createdAt: query.direction };
}

export async function listScans(user: SessionUser, query: ScanListQuery): Promise<ScanListDto> {
  if (query.minScore !== undefined && query.maxScore !== undefined && query.minScore > query.maxScore) {
    throw ApiError.badRequest('The minimum score cannot be greater than the maximum score.');
  }

  const where = buildScanWhere(user, query);

  const [total, rows] = await Promise.all([
    prisma.scan.count({ where }),
    prisma.scan.findMany({
      where,
      orderBy: buildScanOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: scanSummarySelect,
    }),
  ]);

  return {
    scans: rows.map((row) => toScanSummary(row)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getScanDetail(user: SessionUser, scanId: string): Promise<ScanDetailDto> {
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: scanDetailSelect });
  if (!scan) throw ApiError.notFound('Scan not found.');
  assertCanAccessScan(user, scan.user.id);
  return toScanDetail(scan);
}

/** Officer names for the admin history filter. */
export async function listOfficerOptions(): Promise<Array<{ id: string; name: string }>> {
  return prisma.user.findMany({
    where: { scans: { some: {} } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** Date-only filters are inclusive of the whole day the officer picked. */
function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
