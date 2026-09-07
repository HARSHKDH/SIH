import { NextResponse } from 'next/server';

import type { ScanSummaryDto } from '@/lib/api/dto';
import { ApiError, withRoute } from '@/lib/api/errors';
import { createListingScanSchema } from '@/lib/api/schemas';
import { scanSummarySelect, toScanSummary } from '@/lib/api/serializers';
import { requireUser } from '@/lib/auth/server';
import { captureListing, UnsafeUrlError } from '@/lib/listing';
import { prisma } from '@/lib/prisma';
import { enqueueScanJob } from '@/lib/queue/scan-queue';
import { appFileUrl, buildScanImageKey, storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/scans/listing — assess an e-commerce product listing.
 *
 * The problem statement asks for compliance checking of "product labels, package images
 * and product listings". This is the third of those, and it is the only intake path
 * where the subject is a web page rather than a photograph.
 *
 * ## Why the capture happens here rather than in the worker
 *
 * The officer needs to know within a couple of seconds whether the URL could be read at
 * all — a paywalled page, a client-rendered SPA or a plain typo should be a message on
 * the form, not a scan that appears to be queued and fails a minute later with something
 * opaque. Once the page is captured, the resulting image is stored under the ordinary
 * `scans/` prefix, which means the queue, the worker, the rule engine and both report
 * renderers treat this exactly like an uploaded photograph. The only difference reaches
 * the worker as `Scan.sourceText`.
 *
 * ## Legal basis
 *
 * Rule 6(10) of the Legal Metrology (Packaged Commodities) Rules, 2011 requires an
 * e-commerce entity to display the mandatory declarations on the product display page,
 * so the page itself is a legitimate subject of assessment and declarations published as
 * page text count as declared.
 */
export const POST = withRoute(async (request: Request) => {
  const user = await requireUser();

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const { url, productName } = createListingScanSchema.parse(body);

  let capture;
  try {
    capture = await captureListing(url);
  } catch (error) {
    // The guard's messages are written for the officer and say what to do instead, so
    // they are passed through rather than replaced with a generic failure.
    if (error instanceof UnsafeUrlError) throw ApiError.badRequest(error.message);
    console.error('[listing] capture failed', { url, error });
    throw ApiError.badRequest(
      'That listing could not be captured. Check the address, or photograph the pack instead.',
    );
  }

  // The captured image is stored exactly as an uploaded photograph would be, which is
  // what lets the rest of the pipeline stay entirely unaware of where it came from.
  const imageKey = buildScanImageKey(
    productName?.trim() || capture.title || 'listing-image',
    capture.imageContentType,
  );

  await storage.putObject({
    key: imageKey,
    body: capture.imageBytes,
    contentType: capture.imageContentType,
  });

  const scan = await prisma.scan.create({
    data: {
      imageKey,
      imageUrl: appFileUrl(imageKey),
      // The officer's own wording wins; the seller's title is only a fallback.
      productName: productName?.trim() || capture.title?.slice(0, 180) || null,
      status: 'PENDING',
      userId: user.id,
      source: 'ECOMMERCE_LISTING',
      sourceUrl: capture.url,
      sourceText: capture.sourceText,
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
    console.error('[scans] failed to enqueue listing job', { scanId: scan.id, error });
  }

  const dto: ScanSummaryDto = toScanSummary(scan, { includeOfficer: false });

  return NextResponse.json(
    {
      scan: dto,
      queued,
      listing: {
        url: capture.url,
        title: capture.title,
        imageUrl: capture.imageUrl,
        declarationLinesFound: capture.parsed.highlights.length,
        pageTextLength: capture.parsed.visibleTextLength,
      },
      ...(queued
        ? {}
        : {
            warning:
              'The listing was captured but could not be queued for processing. Check that Redis and the worker are running, then use Retry on the scan detail page.',
            queueError,
          }),
    },
    { status: 201 },
  );
});
