import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Edge middleware: the outer gate.
 *
 * This exists so an unauthenticated request never reaches a page render or a DB
 * query, and so a signed-in officer is bounced past the login form. It verifies
 * the JWT signature only — the authoritative check (does this user still exist and
 * is the account still active?) happens in `getSessionUser` on the server, which
 * can actually read the database. `jose` is used precisely because it runs here on
 * the Edge runtime.
 */

const PUBLIC_PATHS = new Set(['/login']);

/** Paths that must stay reachable without a session. */
const PUBLIC_API_PREFIXES = ['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/health'];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // ---- API routes: answer with JSON, never a redirect ----------------------
  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname) || session) return NextResponse.next();

    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  // ---- Pages --------------------------------------------------------------
  if (PUBLIC_PATHS.has(pathname)) {
    if (session) {
      const target = session.role === 'ADMIN' ? '/admin' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    // Preserve where the officer was heading so they land there after signing in.
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Admin area is role-gated here as well as in the route handlers. Defence in
  // depth: middleware keeps the page out of reach, the API keeps the data out of
  // reach even if someone calls it directly.
  if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except Next's internals and the PWA shell files. The service
   * worker and manifest must be fetchable without a session or the app cannot be
   * installed from the login screen.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|icons/|samples/).*)',
  ],
};
