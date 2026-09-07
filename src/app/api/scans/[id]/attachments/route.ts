import { NextResponse } from 'next/server';

import { invalidateStoredReport, loadScanForAttachmentChange } from '@/lib/api/attachments';
import { ApiError, withRoute } from '@/lib/api/errors';
import { createAttachmentSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { getScanDetail } from '@/lib/queries/scans';
import { appFileUrl, isSafeKey, slugify, storage } from '@/lib/storage';
import { sniffAttachmentType } from '@/lib/storage/sniff';
import {
  describeByteLimit,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_SCAN,
} from '@/lib/storage/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/**
 * POST /api/scans/:id/attachments — step 2, record evidence that has been uploaded.
 *
 * The client tells us the key it was granted and the original filename; everything
 * else about the file is established here from the bytes themselves rather than taken
 * on trust:
 *
 *   - the key must be one this scan's own attachment prefix could have produced, so a
 *     valid key belonging to a different scan cannot be re-pointed at this one;
 *   - the object is read back, which proves the upload completed;
 *   - its magic bytes are sniffed, which is the *only* type check an S3 upload gets,
 *     because with S3 configured the browser PUTs straight at the bucket;
 *   - the size and the kind are derived from what was actually stored.
 *
 * The filename is the one thing that cannot be recovered from storage — the key only
 * carries a slug of it — so it is accepted from the client, length-bounded, and always
 * escaped by the report renderers.
 */
export const POST = withRoute(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const scan = await loadScanForAttachmentChange(user, params.id);

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const { fileKey, fileName, caption } = createAttachmentSchema.parse(body);

  // The cap is re-checked here rather than only at presign: two uploads started in
  // parallel would each have passed that earlier check.
  const existing = await prisma.attachment.count({ where: { scanId: scan.id } });
  if (existing >= MAX_ATTACHMENTS_PER_SCAN) {
    throw ApiError.conflict(
      `A scan can carry at most ${MAX_ATTACHMENTS_PER_SCAN} pieces of supporting evidence. Remove one before adding another.`,
    );
  }

  const expectedPrefix = `attachments/${slugify(scan.id, 40)}/`;
  if (!isSafeKey(fileKey) || !fileKey.startsWith(expectedPrefix)) {
    throw ApiError.badRequest('That attachment reference is not valid for this scan.');
  }

  if (await prisma.attachment.findFirst({ where: { fileKey }, select: { id: true } })) {
    throw ApiError.conflict('That file has already been attached to this scan.');
  }

  let stored;
  try {
    stored = await storage.getObject(fileKey);
  } catch {
    throw ApiError.badRequest(
      'The file was not found in storage. The upload may not have completed — please try again.',
    );
  }

  if (stored.body.length === 0) {
    throw ApiError.badRequest('The uploaded file is empty.');
  }
  if (stored.body.length > MAX_ATTACHMENT_BYTES) {
    // Reachable on S3, where a presigned PUT cannot enforce a size ceiling. The
    // orphaned object is removed so a refused upload leaves nothing behind.
    await storage.deleteObject(fileKey).catch(() => undefined);
    throw ApiError.tooLarge(
      `Each attachment must be under ${describeByteLimit(MAX_ATTACHMENT_BYTES)}.`,
    );
  }

  const contentType = sniffAttachmentType(stored.body);
  if (contentType === null) {
    await storage.deleteObject(fileKey).catch(() => undefined);
    throw ApiError.badRequest(
      'That file is not an accepted type. Attach a JPEG, PNG or WebP photograph, or a PDF document.',
    );
  }

  await prisma.attachment.create({
    data: {
      scanId: scan.id,
      // A PDF is paperwork; anything else that got this far is an image.
      kind: contentType === 'application/pdf' ? 'DOCUMENT' : 'PHOTO',
      fileKey,
      fileUrl: appFileUrl(fileKey),
      fileName,
      contentType,
      byteSize: stored.body.length,
      caption: caption && caption.trim().length > 0 ? caption.trim() : null,
      uploadedById: user.id,
    },
  });

  const reportInvalidated = await invalidateStoredReport(scan);

  return NextResponse.json(
    { scan: await getScanDetail(user, scan.id), reportInvalidated },
    { status: 201 },
  );
});
