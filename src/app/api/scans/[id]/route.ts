import { NextResponse } from 'next/server';

import { ApiError, withRoute } from '@/lib/api/errors';
import { assertCanMutateScan } from '@/lib/api/scan-access';
import { updateScanSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { getScanDetail } from '@/lib/queries/scans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

// ---------------------------------------------------------------------------
// GET /api/scans/:id — also polled by the New Scan screen while a job is in flight
// ---------------------------------------------------------------------------

export const GET = withRoute(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  return NextResponse.json({ scan: await getScanDetail(user, params.id) });
});

// ---------------------------------------------------------------------------
// PATCH /api/scans/:id — the officer's observation
// ---------------------------------------------------------------------------

/**
 * Records the officer's note.
 *
 * The note is reprinted in the PDF, so amending it clears `reportKey`: a stored
 * report that no longer matches the record it documents is worse than no report at
 * all. The next download regenerates it from the stored extraction.
 */
export const PATCH = withRoute(async (request: Request, { params }: Params) => {
  const user = await requireUser();

  const existing = await prisma.scan.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, officerNote: true, reportKey: true },
  });
  if (!existing) throw ApiError.notFound('Scan not found.');
  assertCanMutateScan(user, existing.userId);

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const { officerNote } = updateScanSchema.parse(body);

  const note = officerNote && officerNote.trim().length > 0 ? officerNote.trim() : null;
  const noteChanged = note !== existing.officerNote;
  const reportInvalidated = noteChanged && Boolean(existing.reportKey);

  await prisma.scan.update({
    where: { id: params.id },
    data: {
      officerNote: note,
      ...(reportInvalidated ? { reportKey: null, reportUrl: null } : {}),
    },
  });

  return NextResponse.json({
    scan: await getScanDetail(user, params.id),
    reportInvalidated,
  });
});
