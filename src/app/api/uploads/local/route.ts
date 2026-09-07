import { NextResponse } from 'next/server';

import { ApiError, withRoute } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/server';
import { sniffImageMediaType } from '@/lib/extraction/image';
import { storage } from '@/lib/storage';
import { verifyUploadToken } from '@/lib/storage/signing';
import { sniffAttachmentType } from '@/lib/storage/sniff';
import { describeByteLimit, maxBytesForPurpose } from '@/lib/storage/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The local-disk equivalent of an S3 presigned PUT.
 *
 * Four independent checks have to pass before a byte is written:
 *   1. the caller holds a valid session (no anonymous writes),
 *   2. the signed token is intact and unexpired, and pins exactly one key,
 *   3. the payload is within the size limit for the grant's purpose, and
 *   4. the bytes really are of an accepted type, verified from magic bytes rather
 *      than the declared Content-Type.
 *
 * Together these mean a caller cannot choose their own storage key, cannot
 * overwrite someone else's object, and cannot smuggle an arbitrary file onto disk.
 *
 * The grant's purpose decides what "accepted type" means: a scan image must be
 * something the vision model can read, while supporting evidence may also be a PDF.
 * That distinction is signed into the token, so it cannot be flipped by the client.
 */
export const PUT = withRoute(async (request: Request) => {
  await requireUser();

  const token = new URL(request.url).searchParams.get('token');
  if (!token) throw ApiError.badRequest('Upload token is missing.');

  const grant = await verifyUploadToken(token);
  if (!grant) throw ApiError.forbidden('This upload link is invalid or has expired. Start the upload again.');

  const isAttachment = grant.purpose === 'attachment';
  const maxBytes = maxBytesForPurpose(grant.purpose);
  const limit = describeByteLimit(maxBytes);
  const noun = isAttachment ? 'File' : 'Image';

  const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw ApiError.tooLarge(`${noun} must be under ${limit}.`);
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) throw ApiError.badRequest('No file data was received.');
  if (body.length > maxBytes) {
    throw ApiError.tooLarge(`${noun} must be under ${limit}.`);
  }

  const sniffed = isAttachment ? sniffAttachmentType(body) : sniffImageMediaType(body);

  if (sniffed === null) {
    throw ApiError.badRequest(
      isAttachment
        ? 'That file is not an accepted type. Attach a JPEG, PNG or WebP photograph, or a PDF document.'
        : 'That file is not a readable image. Upload a JPEG, PNG or WebP photo.',
    );
  }
  if (sniffed === 'image/heic') {
    throw ApiError.badRequest(
      'HEIC photos cannot be read by the extraction service. Export the photo as JPEG and upload it again.',
    );
  }

  const stored = await storage.putObject({
    key: grant.key,
    body,
    contentType: grant.contentType,
  });

  return NextResponse.json({
    key: stored.key,
    url: stored.url,
    byteLength: body.length,
    contentType: sniffed,
  });
});
