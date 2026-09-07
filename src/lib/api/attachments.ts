import type { SessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

import { ApiError } from './errors';
import { assertCanMutateScan } from './scan-access';

/**
 * Shared groundwork for the supporting-evidence routes.
 *
 * All three of them (presign, record, delete) begin the same way — find the scan,
 * confirm this officer may change it — and two of them end the same way, by
 * invalidating a stored report. Keeping that in one place means the authorisation
 * rule for evidence cannot drift between the route that adds it and the route that
 * removes it.
 */

/**
 * Evidence is part of the officer's own record of an inspection, so the same rule as
 * the observation note applies: only the recording officer may add or remove it, and
 * an admin who can read the scan still cannot alter its evidence.
 */
export async function loadScanForAttachmentChange(
  user: SessionUser,
  scanId: string,
): Promise<{ id: string; userId: string; reportKey: string | null }> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { id: true, userId: true, reportKey: true },
  });
  if (!scan) throw ApiError.notFound('Scan not found.');
  assertCanMutateScan(user, scan.userId);
  return scan;
}

/**
 * Clears a cached PDF once the evidence list changes.
 *
 * Both reports enumerate the attachments, so a stored PDF that lists different
 * evidence than the record it documents is worse than no stored PDF at all — it would
 * be produced in an enforcement context as if it were current. The next download
 * rebuilds it from the extraction on file.
 *
 * Returns whether a stored report was actually discarded, so the UI can say so.
 */
export async function invalidateStoredReport(scan: {
  id: string;
  reportKey: string | null;
}): Promise<boolean> {
  if (!scan.reportKey) return false;
  await prisma.scan.update({
    where: { id: scan.id },
    data: { reportKey: null, reportUrl: null },
  });
  return true;
}
