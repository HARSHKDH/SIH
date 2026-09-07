import { NextResponse } from 'next/server';

import { invalidateStoredReport, loadScanForAttachmentChange } from '@/lib/api/attachments';
import { ApiError, withRoute } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { getScanDetail } from '@/lib/queries/scans';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string; attachmentId: string } };

/**
 * DELETE /api/scans/:id/attachments/:attachmentId — withdraw a piece of evidence.
 *
 * The lookup is scoped by `scanId` as well as by id, so a valid attachment id from
 * another officer's scan resolves to nothing rather than being deleted through a scan
 * the caller does happen to own.
 *
 * Order matters: the row goes first. If removing the stored object fails, the record
 * is still gone and the officer's intent is honoured — a stray object costs disk,
 * whereas a row pointing at bytes that may or may not exist would keep appearing in
 * reports as evidence nobody can open.
 */
export const DELETE = withRoute(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const scan = await loadScanForAttachmentChange(user, params.id);

  const attachment = await prisma.attachment.findFirst({
    where: { id: params.attachmentId, scanId: scan.id },
    select: { id: true, fileKey: true },
  });
  if (!attachment) throw ApiError.notFound('Attachment not found.');

  await prisma.attachment.delete({ where: { id: attachment.id } });

  try {
    await storage.deleteObject(attachment.fileKey);
  } catch (error) {
    console.warn('[attachments] stored object could not be removed', {
      scanId: scan.id,
      fileKey: attachment.fileKey,
      error,
    });
  }

  const reportInvalidated = await invalidateStoredReport(scan);

  return NextResponse.json({
    scan: await getScanDetail(user, scan.id),
    reportInvalidated,
  });
});
