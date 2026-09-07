import { NextResponse } from 'next/server';

import { ApiError, withRoute } from '@/lib/api/errors';
import { createUserSchema } from '@/lib/api/schemas';
import { adminUserSelect, toAdminUser } from '@/lib/api/serializers';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { listUsers } from '@/lib/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/admin/users — the officer roster
// ---------------------------------------------------------------------------

export const GET = withRoute(async () => {
  await requireAdmin();
  return NextResponse.json({ users: await listUsers() });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users — create an officer account
// ---------------------------------------------------------------------------

export const POST = withRoute(async (request: Request) => {
  await requireAdmin();

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const input = createUserSchema.parse(body);

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw ApiError.conflict('An account with that email address already exists.');

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      designation: input.designation?.trim() || null,
      jurisdiction: input.jurisdiction?.trim() || null,
    },
    select: adminUserSelect,
  });

  return NextResponse.json({ user: toAdminUser(user) }, { status: 201 });
});
