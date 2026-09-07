import { withRoute } from '@/lib/api/errors';
import { assertCanAccessScan } from '@/lib/api/scan-access';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { buildReportDataForScan, generateComplianceReport } from '@/lib/report';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Regenerating a report launches Chrome, which is slow but bounded.
export const maxDuration = 60;

/**
 * GET /api/scans/:id/report — download the PDF, generating it on demand.
 *
 * The worker normally renders the report as the last pipeline step. This route covers
 * the two cases where it is missing: the Chrome render failed (the worker deliberately
 * treats that as non-fatal), or the officer amended their note and the stale report was
 * invalidated.
 *
 * Report inputs come from `buildReportDataForScan`, shared with the DOCX route, so the
 * two formats can never be built from different data.
 */
export const GET = withRoute(async (request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();

  const download = new URL(request.url).searchParams.get('download') === '1';
  const filename = `compliance-report-${params.id.slice(-10)}.pdf`;

  // ---- Fast path: serve the stored PDF -------------------------------------
  const existing = await prisma.scan.findUnique({
    where: { id: params.id },
    select: { reportKey: true, userId: true, status: true },
  });

  if (existing?.reportKey && existing.status === 'COMPLETED') {
    assertCanAccessScan(user, existing.userId);
    try {
      const object = await storage.getObject(existing.reportKey);
      return pdfResponse(object.body, filename, download);
    } catch {
      // Fall through and regenerate rather than 500 on a missing object.
      console.warn('[report] stored report missing, regenerating', { scanId: params.id });
    }
  }

  // ---- Slow path: regenerate ----------------------------------------------
  const { data, ownerId } = await buildReportDataForScan(params.id);
  assertCanAccessScan(user, ownerId);

  const generated = await generateComplianceReport(data);

  await prisma.scan.update({
    where: { id: params.id },
    data: { reportKey: generated.key, reportUrl: generated.url },
  });

  const object = await storage.getObject(generated.key);
  return pdfResponse(object.body, filename, download);
});

function pdfResponse(body: Buffer, filename: string, download: boolean): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(body.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
