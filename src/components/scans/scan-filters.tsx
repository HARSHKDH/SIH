'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { SCAN_STATUS_LABEL } from '@/lib/labels';

const SEARCH_DEBOUNCE_MS = 400;

/**
 * The history filter bar.
 *
 * Filter state lives in the URL, not in React state. That makes every filtered view
 * shareable and back-button-correct, and it means the actual filtering happens in
 * Postgres via the same `scanListQuerySchema` the JSON API validates against — the
 * browser never receives rows it is not going to show.
 *
 * The text search is debounced so typing a product name is one query rather than one
 * per keystroke; the selects apply immediately, because a dropdown change is a
 * deliberate single act.
 */
export function ScanFilters({
  officers,
  showScope,
}: {
  officers?: Array<{ id: string; name: string }>;
  showScope?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debounce = useRef<number | undefined>(undefined);

  // Keep the box in step when the URL changes from elsewhere (Clear, back button).
  useEffect(() => {
    setSearch(searchParams.get('search') ?? '');
  }, [searchParams]);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    // Any filter change invalidates the current page number.
    next.delete('page');

    const query = next.toString();
    startTransition(() => router.push(query ? `/scans?${query}` : '/scans'));
  }

  function onSearchChange(value: string) {
    setSearch(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => apply({ search: value.trim() || null }), SEARCH_DEBOUNCE_MS);
  }

  const activeFilters = ['search', 'status', 'severity', 'minScore', 'maxScore', 'from', 'to', 'officerId'].filter(
    (key) => searchParams.get(key),
  ).length;

  return (
    <div className="border-b border-line px-4 py-3.5 sm:px-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Product name" className="sm:col-span-2 lg:col-span-1">
          {({ id }) => (
            <Input
              id={id}
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by product"
              autoComplete="off"
            />
          )}
        </Field>

        <Field label="Status">
          {({ id }) => (
            <Select
              id={id}
              value={searchParams.get('status') ?? ''}
              onChange={(event) => apply({ status: event.target.value })}
            >
              <option value="">Any status</option>
              {(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const).map((status) => (
                <option key={status} value={status}>
                  {SCAN_STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Contains a finding of">
          {({ id }) => (
            <Select
              id={id}
              value={searchParams.get('severity') ?? ''}
              onChange={(event) => apply({ severity: event.target.value })}
            >
              <option value="">Any severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="MODERATE">Moderate</option>
              <option value="MINOR">Minor</option>
            </Select>
          )}
        </Field>

        <Field label="Sort by">
          {({ id }) => (
            <Select
              id={id}
              value={`${searchParams.get('sort') ?? 'createdAt'}:${searchParams.get('direction') ?? 'desc'}`}
              onChange={(event) => {
                const [sort, direction] = event.target.value.split(':');
                apply({ sort, direction });
              }}
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="complianceScore:asc">Lowest score first</option>
              <option value="complianceScore:desc">Highest score first</option>
              <option value="productName:asc">Product A–Z</option>
            </Select>
          )}
        </Field>

        <Field label="Score from" hint="0–100">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={100}
              value={searchParams.get('minScore') ?? ''}
              onChange={(event) => apply({ minScore: event.target.value })}
              placeholder="0"
            />
          )}
        </Field>

        <Field label="Score to" hint="0–100">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={100}
              value={searchParams.get('maxScore') ?? ''}
              onChange={(event) => apply({ maxScore: event.target.value })}
              placeholder="100"
            />
          )}
        </Field>

        <Field label="Recorded from">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={searchParams.get('from') ?? ''}
              onChange={(event) => apply({ from: event.target.value })}
            />
          )}
        </Field>

        <Field label="Recorded to">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={searchParams.get('to') ?? ''}
              onChange={(event) => apply({ to: event.target.value })}
            />
          )}
        </Field>

        {showScope && officers ? (
          <Field label="Officer" className="sm:col-span-2 lg:col-span-2">
            {({ id }) => (
              <Select
                id={id}
                value={searchParams.get('officerId') ?? ''}
                onChange={(event) =>
                  // Filtering by a specific officer only makes sense across the whole
                  // department, so widening the scope comes along with it.
                  apply({ officerId: event.target.value, scope: 'all' })
                }
              >
                <option value="">All officers</option>
                {officers.map((officer) => (
                  <option key={officer.id} value={officer.id}>
                    {officer.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-label text-ink-muted">
          {activeFilters === 0
            ? 'No filters applied.'
            : `${activeFilters} filter${activeFilters === 1 ? '' : 's'} applied.`}
        </p>

        <div className="flex items-center gap-2">
          {pending ? <Spinner className="h-3.5 w-3.5 text-brand" /> : null}
          {showScope ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                apply({ scope: searchParams.get('scope') === 'all' ? 'mine' : 'all', officerId: null })
              }
            >
              {searchParams.get('scope') === 'all' ? 'Show only mine' : 'Show all officers'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={activeFilters === 0}
            onClick={() => startTransition(() => router.push('/scans'))}
          >
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  );
}
