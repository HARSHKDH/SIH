import { redirect } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { getSessionUser } from '@/lib/auth/server';
import { extractionProvider } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Layout for every authenticated screen.
 *
 * The session is resolved once here and handed to the shell. Middleware has already
 * checked the JWT, but this is the check that reads the database — so an account
 * deactivated by an admin two seconds ago is turned away here rather than at token
 * expiry.
 */
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <AppShell user={user} extractionMode={extractionProvider}>
      {children}
    </AppShell>
  );
}
