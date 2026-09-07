import { NextResponse } from 'next/server';

import { loadScanForAttachmentChange } from '@/lib/api/attachments';
import type { UploadTargetDto } from '@/lib/api/dto';
import { ApiError, withRoute } from '@/lib/api/errors';
import { attachmentPresignSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { buildAttachmentKey, storage } from '@/lib/storage';
import { MAX_ATTACHMENTS_PER_SCAN } from '@/lib/storage/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_TTL_SECONDS = 900;

type Params = { params: { id: string } };

/**
 * POST /api/scans/:id/attachments/presign — step 1 of attaching supporting evidence.
 *
 * Mirrors `/api/uploads/presign`, with two differences that matter. The grant is
 * issued for the `attachment` purpose, which widens the accepted types to include PDF
 * and raises the size cap; and authorisation is checked *before* a grant is handed
 * out, so an officer cannot obtain a writable key against another officer's scan.
 *
 * The per-scan cap is enforced here as well as at record time. Checking it up front
 * saves the officer a pointless 15 MB upload that would only be refused afterwards.
 */
export const POST = withRoute(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const scan = await loadScanForAttachmentChange(user, params.id);

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const { contentType, fileName } = attachmentPresignSchema.parse(body);

  const existing = await prisma.attachment.count({ where: { scanId: scan.id } });
  if (existing >= MAX_ATTACHMENTS_PER_SCAN) {
    throw ApiError.conflict(
      `A scan can carry at most ${MAX_ATTACHMENTS_PER_SCAN} pieces of supporting evidence. Remove one before adding another.`,
    );
  }

  const key = buildAttachmentKey(scan.id, fileName, contentType);
  const target = await storage.createUploadTarget({
    key,
    contentType,
    expiresInSeconds: UPLOAD_TTL_SECONDS,
    purpose: 'attachment',
  });

  const dto: UploadTargetDto = {
    driver: target.driver,
    key: target.key,
    uploadUrl: target.uploadUrl,
    method: target.method,
    headers: target.headers,
    publicUrl: target.publicUrl,
    expiresInSeconds: target.expiresInSeconds,
  };

  return NextResponse.json(dto);
});
