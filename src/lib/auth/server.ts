import { cookies } from 'next/headers';

import { ApiError } from '@/lib/api/errors';
import { prisma } from '@/lib/prisma';

import { SESSION_COOKIE, verifySessionToken, type SessionUser } from './session';

/**
 * Resolves the caller from the session cookie.
 *
 * The JWT is only the first gate: we re-read the user row so that an account
 * deactivated by an admin loses access immediately instead of at token expiry.
 * That matters for an enforcement tool where revocation has to be instant.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Same as `getSessionUser` but throws a 401 instead of returning null. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}

/** Throws 401 when unauthenticated and 403 when authenticated but not an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') {
    throw ApiError.forbidden('This action is restricted to administrators.');
  }
  return user;
}

export type { SessionUser };
