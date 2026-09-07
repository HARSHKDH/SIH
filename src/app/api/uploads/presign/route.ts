import { NextResponse } from 'next/server';

import type { UploadTargetDto } from '@/lib/api/dto';
import { ApiError, withRoute } from '@/lib/api/errors';
import { presignSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/server';
import { buildScanImageKey, storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_TTL_SECONDS = 900;

/**
 * Step 1 of the upload flow: hand the browser somewhere to put the bytes.
 *
 * With S3 configured this is a genuine presigned PUT and the image never touches
 * the Node process. On the local-disk fallback it is a signed, key-pinned,
 * short-lived PUT against `/api/uploads/local`, so the client code is identical
 * either way and swapping drivers is a config change.
 */
export const POST = withRoute(async (request: Request) => {
  await requireUser();

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });

  const { contentType, productName } = presignSchema.parse(body);

  const key = buildScanImageKey(productName ?? null, contentType);
  const target = await storage.createUploadTarget({
    key,
    contentType,
    expiresInSeconds: UPLOAD_TTL_SECONDS,
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
