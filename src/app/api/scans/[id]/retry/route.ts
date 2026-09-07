import { NextResponse } from 'next/server';

import { ApiError, withRoute } from '@/lib/api/errors';
import { assertCanMutateScan } from '@/lib/api/scan-access';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { enqueueScanJob } from '@/lib/queue/scan-queue';
import { getScanDetail } from '@/lib/queries/scans';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/scans/:id/retry — re-run a failed scan.
 *
 * This is the user-facing half of the async failure story: the worker records why
 * a scan failed, and this puts it back on the queue without asking the officer to
 * re-photograph the package. `processScan` replaces prior declarations and
 * violations, so a retry is a clean re-assessment rather than an append.
 */
export const POST = withRoute(async (_request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();

  const scan = await prisma.scan.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, status: true, imageKey: true, attemptCount: true },
  });
  if (!scan) throw ApiError.notFound('Scan not found.');
  assertCanMutateScan(user, scan.userId);

  if (scan.status === 'PENDING' || scan.status === 'PROCESSING') {
    throw ApiError.conflict('This scan is already queued for processing.');
  }

  // No point re-queuing when the evidence itself is gone.
  const exists = await storage.objectExists(scan.imageKey);
  if (!exists) {
    throw ApiError.badRequest(
      'The original label image is no longer in storage, so this scan cannot be re-run. Please record a new scan.',
    );
  }

  await prisma.scan.update({
    where: { id: scan.id },
    data: {
      status: 'PENDING',
      failureReason: null,
      processingStartedAt: null,
      processedAt: null,
      complianceScore: null,
    },
  });

  try {
    // The attempt number is part of the job id, so re-queuing is never swallowed
    // as a duplicate of the previous run.
    await enqueueScanJob(scan.id, scan.attemptCount + 1);
  } catch (error) {
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: 'FAILED',
        failureReason:
          'The processing queue could not be reached. Check that Redis is running and the worker is started, then retry.',
      },
    });
    throw ApiError.internal(
      error instanceof Error
        ? `Could not queue the scan: ${error.message}`
        : 'Could not queue the scan for processing.',
    );
  }

  return NextResponse.json({ scan: await getScanDetail(user, scan.id), queued: true });
});
