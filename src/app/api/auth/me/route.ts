import { NextResponse } from 'next/server';

import { withRoute } from '@/lib/api/errors';
import { getSessionUser } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(async () => {
  const user = await getSessionUser();
  // Returns 200 with `user: null` rather than 401 — this endpoint answers
  // "who am I?", and "nobody" is a valid answer, not an error.
  return NextResponse.json({ user });
});
