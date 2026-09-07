import { NextResponse } from 'next/server';

import { withRoute } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/server';
import { getDashboardData } from '@/lib/queries/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stats/dashboard
 *
 * Thin wrapper over `getDashboardData`, which the server-rendered dashboard page
 * calls directly. Scope (own casework vs. the whole department) is decided inside
 * that function from the caller's role.
 */
export const GET = withRoute(async () => {
  const user = await requireUser();
  return NextResponse.json(await getDashboardData(user));
});
