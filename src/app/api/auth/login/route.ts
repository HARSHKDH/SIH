import { NextResponse } from 'next/server';

import { ApiError, withRoute } from '@/lib/api/errors';
import { clientIdentifier, consumeRateLimit, resetRateLimit } from '@/lib/api/rate-limit';
import { loginSchema } from '@/lib/api/schemas';
import { verifyPassword } from '@/lib/auth/password';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionMaxAgeSeconds,
  signSessionToken,
} from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

import type { SessionUserDto } from '@/lib/api/dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(async (request: Request) => {
  consumeRateLimit({
    key: `login:${clientIdentifier(request)}`,
    limit: 10,
    windowMs: 5 * 60 * 1000,
  });

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });

  const { email, password } = loginSchema.parse(body);

  const user = await prisma.user.findUnique({ where: { email } });

  // One message and one code path for "no such user", "wrong password" and
  // "deactivated account" — anything else lets an attacker enumerate officers.
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !passwordOk || !user.isActive) {
    throw ApiError.unauthorized('Those credentials do not match an active account.');
  }

  const token = await signSessionToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  resetRateLimit(`login:${clientIdentifier(request)}`);

  const sessionUser: SessionUserDto = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const response = NextResponse.json({
    user: sessionUser,
    // Role-aware landing page, so an admin does not have to navigate twice.
    redirectTo: user.role === 'ADMIN' ? '/admin' : '/dashboard',
  });

  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(sessionMaxAgeSeconds()));
  return response;
});
