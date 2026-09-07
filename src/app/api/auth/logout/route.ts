import { NextResponse } from 'next/server';

import { withRoute } from '@/lib/api/errors';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(async () => {
  const response = NextResponse.json({ ok: true });
  // maxAge 0 expires the cookie immediately; the options must otherwise match
  // the ones used at sign-in or the browser will keep the original cookie.
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
});
