import { ApiError, withRoute } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/server';
import { isSafeKey, storage } from '@/lib/storage';
import { contentTypeForKey } from '@/lib/storage/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated read path for every stored object — label photographs and
 * generated PDF reports alike.
 *
 * Routing reads through the app rather than exposing the bucket (or the storage
 * directory) publicly means evidence images are never world-readable by URL,
 * which matters when the image is attached to an enforcement record. The cost is
 * one hop; the benefit is that access control is not a bucket-policy question.
 */
export const GET = withRoute(async (_request: Request, context: { params: { key: string[] } }) => {
  await requireUser();

  const key = context.params.key.join('/');
  if (!isSafeKey(key)) throw ApiError.badRequest('Invalid file reference.');

  let object: { body: Buffer; contentType: string };
  try {
    object = await storage.getObject(key);
  } catch {
    throw ApiError.notFound('That file is no longer available.');
  }

  const contentType = object.contentType || contentTypeForKey(key);
  const filename = key.split('/').pop() ?? 'download';

  return new Response(new Uint8Array(object.body), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.body.length),
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      // Objects are immutable once written, but they are also evidence, so the
      // cache must stay private to the authenticated user.
      'Cache-Control': 'private, max-age=3600, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
