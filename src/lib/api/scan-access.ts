import type { Prisma } from '@prisma/client';

import type { SessionUser } from '@/lib/auth/session';

import { ApiError } from './errors';

/**
 * Access model, in one place.
 *
 * An OFFICER sees only the scans they recorded — their own casework. An ADMIN can
 * see everything, because aggregate oversight is the point of the admin role.
 * Every scan query and mutation funnels through these two helpers rather than
 * re-deriving the rule, so there is exactly one place to audit.
 */
export function scanOwnershipFilter(user: SessionUser, scope: 'mine' | 'all' = 'mine'): Prisma.ScanWhereInput {
  if (user.role === 'ADMIN' && scope === 'all') return {};
  return { userId: user.id };
}

export function assertCanAccessScan(user: SessionUser, scanOwnerId: string): void {
  if (user.role === 'ADMIN') return;
  if (scanOwnerId === user.id) return;
  // 404 rather than 403: confirming a scan exists but is someone else's leaks
  // information about other officers' casework.
  throw ApiError.notFound('Scan not found.');
}

/** Notes and retries are the recording officer's own act, so admins do not edit them. */
export function assertCanMutateScan(user: SessionUser, scanOwnerId: string): void {
  if (scanOwnerId === user.id) return;
  if (user.role === 'ADMIN') {
    throw ApiError.forbidden(
      'Only the officer who recorded a scan can amend its note or re-run it.',
    );
  }
  throw ApiError.notFound('Scan not found.');
}
