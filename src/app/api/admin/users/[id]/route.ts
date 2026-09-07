import { NextResponse } from 'next/server';

import { ApiError, withRoute } from '@/lib/api/errors';
import { updateUserSchema } from '@/lib/api/schemas';
import { adminUserSelect, toAdminUser } from '@/lib/api/serializers';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/users/:id
 *
 * Handles renaming, role changes, password resets and activation. Accounts are
 * never hard-deleted: `Scan.userId` cascades, so removing an officer would delete
 * their entire inspection history. Deactivation keeps the audit trail intact while
 * revoking access immediately — `getSessionUser` re-reads `isActive` on every
 * request, so a deactivated officer is locked out on their next click rather than
 * at token expiry.
 *
 * Three guards stop an administrator from breaking the system from the inside:
 * you cannot deactivate yourself, you cannot demote yourself, and you cannot
 * remove the last remaining active administrator.
 */
export const PATCH = withRoute(async (request: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, isActive: true, email: true },
  });
  if (!target) throw ApiError.notFound('That account does not exist.');

  const body = await request.json().catch(() => {
    throw ApiError.badRequest('Request body must be JSON.');
  });
  const input = updateUserSchema.parse(body);

  const isSelf = target.id === admin.id;
  const deactivating = input.isActive === false && target.isActive;
  const demoting = input.role === 'OFFICER' && target.role === 'ADMIN';

  if (isSelf && deactivating) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }
  if (isSelf && demoting) {
    throw ApiError.badRequest('You cannot remove your own administrator role.');
  }

  if (deactivating || demoting) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw ApiError.badRequest(
        'This is the last active administrator account. Promote another officer to administrator first.',
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.designation !== undefined
        ? { designation: input.designation?.trim() || null }
        : {}),
      ...(input.jurisdiction !== undefined
        ? { jurisdiction: input.jurisdiction?.trim() || null }
        : {}),
      ...(input.password !== undefined
        ? { passwordHash: await hashPassword(input.password) }
        : {}),
    },
    select: adminUserSelect,
  });

  return NextResponse.json({ user: toAdminUser(user) });
});
