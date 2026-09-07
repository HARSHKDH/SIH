import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * Root is a router, not a page.
 *
 * Middleware already blocks unauthenticated access, but the landing target depends
 * on role — an admin's first screen is the administration panel — and role is only
 * known once the session is resolved.
 */
export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(user.role === 'ADMIN' ? '/admin' : '/dashboard');
}
