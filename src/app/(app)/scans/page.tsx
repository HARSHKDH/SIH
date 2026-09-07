import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DownloadIcon } from '@/components/layout/icons';
import { ScanFilters } from '@/components/scans/scan-filters';
import { ScanTable } from '@/components/scans/scan-table';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader } from '@/components/ui/card';
import { AnchorButton, LinkButton } from '@/components/ui/link-button';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { ApiError } from '@/lib/api/errors';
import { scanListQuerySchema } from '@/lib/api/schemas';
import { getSessionUser } from '@/lib/auth/server';
import { listOfficerOptions, listScans } from '@/lib/queries/scans';

export const metadata: Metadata = { title: 'Scan history' };
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** Collapses Next's `string | string[]` params into the flat shape zod expects. */
function flatten(params: SearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== '') result[key] = single;
  }
  return result;
}

/**
 * Scan history.
 *
 * Filtering, sorting and paging are all URL-driven and executed in Postgres by
 * `listScans` — the same function the JSON API calls. The page is server-rendered on
 * every request, so a register of 10,000 scans costs the browser one page of rows.
 */
export default async function ScanHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const isAdmin = user.role === 'ADMIN';
  const raw = flatten(searchParams);

  // An admin's register defaults to the whole department; an officer's is always
  // their own casework, whatever the query string asks for.
  const parsed = scanListQuerySchema.safeParse({
    ...raw,
    scope: isAdmin ? (raw.scope ?? 'all') : 'mine',
  });

  if (!parsed.success) {
    return (
      <>
        <PageHeader title="Scan history" />
        <Alert tone="error" title="Those filters are not valid">
          Clear the filters and try again.
          <div className="mt-2">
            <LinkButton href="/scans" variant="secondary" size="sm">
              Clear filters
            </LinkButton>
          </div>
        </Alert>
      </>
    );
  }

  const query = parsed.data;

  let result;
  try {
    result = await listScans(user, query);
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : 'The register could not be loaded.';
    return (
      <>
        <PageHeader title="Scan history" />
        <Alert tone="error" title="Could not load the register">
          {message}
        </Alert>
      </>
    );
  }

  const officers = isAdmin ? await listOfficerOptions() : undefined;

  /**
   * The export carries the active filters, minus the paging.
   *
   * A CSV that ignored the filters on screen would be a different dataset wearing the
   * same name — the officer asked for "these scans", not "all scans".
   */
  const exportParams = new URLSearchParams(raw);
  exportParams.delete('page');
  exportParams.delete('pageSize');
  const exportHref = exportParams.toString()
    ? `/api/scans/export?${exportParams.toString()}`
    : '/api/scans/export';

  /** Preserves every active filter when moving between pages. */
  function hrefForPage(page: number): string {
    const params = new URLSearchParams(raw);
    if (page <= 1) params.delete('page');
    else params.set('page', String(page));
    const query = params.toString();
    return query ? `/scans?${query}` : '/scans';
  }

  return (
    <>
      <PageHeader
        title="Scan history"
        description={
          isAdmin
            ? 'Every scan recorded by the department. Filter by officer, status, score or date.'
            : 'Every scan you have recorded. Filter by status, score, severity or date.'
        }
        actions={<LinkButton href="/scans/new">Record new scan</LinkButton>}
      />

      <Card>
        <CardHeader
          title="Register"
          description={`${result.pagination.total} scan${result.pagination.total === 1 ? '' : 's'} match`}
          as="h3"
          actions={
            result.pagination.total > 0 ? (
              <AnchorButton href={exportHref} variant="secondary" size="sm" download>
                <DownloadIcon className="h-4 w-4" />
                Export CSV
              </AnchorButton>
            ) : null
          }
        />

        <ScanFilters officers={officers} showScope={isAdmin} />

        <ScanTable
          scans={result.scans}
          showOfficer={isAdmin}
          emptyTitle={result.pagination.total === 0 ? 'No scans match these filters' : 'Nothing on this page'}
          emptyDescription="Adjust or clear the filters above, or record a new scan."
          emptyAction={
            <LinkButton href="/scans" variant="secondary">
              Clear filters
            </LinkButton>
          }
        />

        <Pagination pagination={result.pagination} buildHref={hrefForPage} />
      </Card>
    </>
  );
}
