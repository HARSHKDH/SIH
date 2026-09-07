import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ScanDetailView } from '@/components/scans/scan-detail-view';
import { ApiError } from '@/lib/api/errors';
import { getSessionUser } from '@/lib/auth/server';
import { scanRef } from '@/lib/format';
import { getScanDetail } from '@/lib/queries/scans';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Scan LM/${scanRef(params.id)}` };
}

/**
 * Scan detail.
 *
 * The scan is fetched on the server so the first paint already carries the findings —
 * then handed to a client component that keeps polling if the worker has not finished.
 * `getScanDetail` enforces access: an officer can only open their own scans, and a
 * request for someone else's returns 404 rather than 403, so the page cannot be used
 * to discover that a scan exists.
 */
export default async function ScanDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  try {
    const scan = await getScanDetail(user, params.id);

    // Notes and retries belong to the officer who recorded the scan; an admin can
    // read everything but does not amend another official's record.
    const canMutate = scan.officer?.id === user.id;

    return <ScanDetailView initialScan={scan} canMutate={canMutate} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
