import { NextResponse } from 'next/server';

import type { ScanSummaryDto } from '@/lib/api/dto';
import { ApiError, withRoute } from '@/lib/api/errors';
import { createScanSchema, scanListQuerySchema, searchParamsToObject } from '@/lib/api/schemas';
import { scanSummarySelect, toScanSummary } from '@/lib/api/serializers';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { enqueueScanJob } from '@/lib/queue/scan-queue';
import { listScans } from '@/lib/queries/scans';
import { isSafeKey, storage } from '@/lib/storage';
import { SCAN_IMAGE_KEY_PREFIX } from '@/lib/storage/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/scans — step 2 of the upload flow
// ---------------------------------------------------------------------------

/**
 * Creates the Scan row and enqueues the processing job.
 *
 * Ordering matters. The row is written first and the job second: if the enqueue
 * fails, the officer is left with a visible PENDING scan and a working Retry
 * button, which is recoverable. Enqueuing first would risk a worker picking up a
 * job whose row does not exist yet.
 */
export const POST = withRoute(async (request: Request) => {
  const user = await requireUser();

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const { imageKey, productName } = createScanSchema.parse(body);

  // The key was minted by /api/uploads/presign, but it arrives back from the
  // client, so it is re-validated here. Pinning the prefix stops a caller
  // pointing a Scan row at a generated report or any other object.
  if (!isSafeKey(imageKey) || !imageKey.startsWith(SCAN_IMAGE_KEY_PREFIX)) {
    throw ApiError.badRequest('That image reference is not valid.');
  }

  // Confirm the bytes actually landed. Without this an interrupted upload would
  // produce a scan that fails in the worker for no reason the officer can see.
  const exists = await storage.objectExists(imageKey);
  if (!exists) {
    throw ApiError.badRequest(
      'The label image was not found in storage. The upload may not have completed — please try again.',
    );
  }

  const scan = await prisma.scan.create({
    data: {
      imageKey,
      imageUrl: storage.publicUrl(imageKey),
      productName: productName?.trim() || null,
      status: 'PENDING',
      userId: user.id,
    },
    select: scanSummarySelect,
  });

  let queued = true;
  let queueError: string | null = null;
  try {
    await enqueueScanJob(scan.id, 1);
  } catch (error) {
    queued = false;
    queueError = error instanceof Error ? error.message : 'The processing queue could not be reached.';
    console.error('[scans] failed to enqueue job', { scanId: scan.id, error });
  }

  const dto: ScanSummaryDto = toScanSummary(scan, { includeOfficer: false });

  return NextResponse.json(
    {
      scan: dto,
      queued,
      ...(queued
        ? {}
        : {
            warning:
              'The scan was saved but could not be queued for processing. Check that Redis and the worker are running, then use Retry on the scan detail page.',
            queueError,
          }),
    },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// GET /api/scans — searchable, filterable, paginated history
// ---------------------------------------------------------------------------

export const GET = withRoute(async (request: Request) => {
  const user = await requireUser();
  const query = scanListQuerySchema.parse(
    searchParamsToObject(new URL(request.url).searchParams),
  );
  return NextResponse.json(await listScans(user, query));
});
