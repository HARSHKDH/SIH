import { NextResponse } from 'next/server';

import { withRoute } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/auth/server';
import { getAdminStats } from '@/lib/queries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/stats — aggregate violation statistics by rule type. */
export const GET = withRoute(async () => {
  await requireAdmin();
  return NextResponse.json(await getAdminStats());
});
