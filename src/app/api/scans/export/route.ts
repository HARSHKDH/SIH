import { withRoute } from '@/lib/api/errors';
import { scanListQuerySchema, searchParamsToObject } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { CSV_CONTENT_TYPE, csvFileName, toCsv } from '@/lib/report/csv';
import { buildScanWhere } from '@/lib/queries/scans';
import { complianceBand } from '@/lib/rules/engine';
import { SCAN_STATUS_LABEL, type ScanStatusKey } from '@/lib/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hard ceiling so one request cannot try to serialise the entire table into memory. */
const MAX_ROWS = 5_000;

const HEADERS = [
  'Reference',
  'Scan ID',
  'Product name',
  'Source',
  'Listing URL',
  'Status',
  'Compliance score',
  'Verdict',
  'Critical',
  'Moderate',
  'Minor',
  'Total findings',
  'Rule codes breached',
  'Officer',
  'Designation',
  'Jurisdiction',
  'Recorded at (IST)',
  'Assessed at (IST)',
  'Attempts',
  'Failure reason',
  'Officer note',
] as const;

const IST = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const ist = (value: Date | null) => (value ? IST.format(value) : '');

/**
 * GET /api/scans/export — the scan register as CSV.
 *
 * This is the "editable format" half of the reporting requirement at the register
 * level: the DOCX covers one inspection, this covers a body of work. An officer can
 * pivot it in Excel to answer "which packers are repeat offenders this quarter", which
 * is the question the dashboards cannot answer on their own.
 *
 * It deliberately reuses `buildScanWhere` and the same query schema as the history
 * screen, so **the export is exactly what the filters are showing** — a CSV that
 * silently ignored the active filters would be worse than no export.
 */
export const GET = withRoute(async (request: Request) => {
  const user = await requireUser();

  const raw = searchParamsToObject(new URL(request.url).searchParams);
  const query = scanListQuerySchema.parse({
    ...raw,
    // Export is not paginated; page size is irrelevant and capped below.
    page: '1',
    pageSize: '100',
    scope: user.role === 'ADMIN' ? (raw.scope ?? 'all') : 'mine',
  });

  const where = buildScanWhere(user, query);

  const scans = await prisma.scan.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
    select: {
      id: true,
      productName: true,
      source: true,
      sourceUrl: true,
      status: true,
      complianceScore: true,
      officerNote: true,
      failureReason: true,
      attemptCount: true,
      createdAt: true,
      processedAt: true,
      user: { select: { name: true, designation: true, jurisdiction: true } },
      violations: { select: { severity: true, ruleCode: true } },
    },
  });

  const rows = scans.map((scan) => {
    const critical = scan.violations.filter((v) => v.severity === 'CRITICAL').length;
    const moderate = scan.violations.filter((v) => v.severity === 'MODERATE').length;
    const minor = scan.violations.filter((v) => v.severity === 'MINOR').length;

    const verdict =
      scan.status === 'COMPLETED' && scan.complianceScore !== null
        ? complianceBand({
            score: scan.complianceScore,
            criticalCount: critical,
            moderateCount: moderate,
            minorCount: minor,
          })
        : '';

    return [
      `LM/${scan.id.slice(-10).toUpperCase()}`,
      scan.id,
      scan.productName ?? '',
      scan.source === 'ECOMMERCE_LISTING' ? 'E-commerce listing' : 'Photograph',
      scan.sourceUrl ?? '',
      SCAN_STATUS_LABEL[scan.status as ScanStatusKey],
      scan.complianceScore ?? '',
      verdict,
      critical,
      moderate,
      minor,
      scan.violations.length,
      // Sorted and de-duplicated so the column is stable enough to pivot on.
      [...new Set(scan.violations.map((v) => v.ruleCode))].sort().join(' | '),
      scan.user.name,
      scan.user.designation ?? '',
      scan.user.jurisdiction ?? '',
      ist(scan.createdAt),
      ist(scan.processedAt),
      scan.attemptCount,
      scan.failureReason ?? '',
      scan.officerNote ?? '',
    ];
  });

  const csv = toCsv(HEADERS, rows);
  const filename = csvFileName('scan-register');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': CSV_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
