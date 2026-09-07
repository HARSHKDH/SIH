import type { Metadata } from 'next';

import { extractionProvider, isDevelopment } from '@/lib/env';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/**
 * Sign-in screen.
 *
 * Split layout: an institutional brand panel on the left from `lg` up, the form on
 * the right. On a phone the brand panel collapses to a compact header so the form is
 * the first thing in reach.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* ---- Brand panel ---- */}
      <div className="flex shrink-0 flex-col justify-between bg-brand px-6 py-6 text-ink-inverse lg:w-[46%] lg:max-w-2xl lg:px-12 lg:py-12">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-control bg-white/10 text-body font-semibold"
            aria-hidden="true"
          >
            LM
          </span>
          <div>
            <p className="text-label font-semibold leading-tight">Legal Metrology Department</p>
            <p className="text-micro uppercase tracking-wider text-white/60">Government of India</p>
          </div>
        </div>

        <div className="mt-8 lg:mt-0">
          <h1 className="max-w-lg text-balance text-h1 font-semibold leading-snug lg:text-[1.75rem] lg:leading-tight">
            Packaged Commodities Compliance Checker
          </h1>
          <p className="mt-3 max-w-md text-body text-white/70">
            Photograph a package label in the field and get an auditable record of the
            mandatory declarations, the clauses breached, and a compliance score you can
            defend.
          </p>

          <dl className="mt-8 hidden gap-5 lg:grid lg:grid-cols-2">
            {[
              {
                term: 'Declarations checked',
                detail: 'Manufacturer, net quantity, MRP, date, consumer care, origin, unit price',
              },
              {
                term: 'Rule book',
                detail: '12 clauses of the Packaged Commodities Rules, 2011, applied deterministically',
              },
              {
                term: 'Evidence retained',
                detail: 'Label photograph, verbatim transcription, and a signed-off PDF report',
              },
              {
                term: 'Works in the field',
                detail: 'Installable on a phone, with camera capture and offline shell',
              },
            ].map((item) => (
              <div key={item.term}>
                <dt className="text-micro font-semibold uppercase tracking-wider text-white/50">
                  {item.term}
                </dt>
                <dd className="mt-1 text-label leading-relaxed text-white/80">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-8 hidden text-micro leading-relaxed text-white/40 lg:block">
          Authorised use only. Activity in this system is attributed to the signed-in
          official and retained as part of the inspection record.
        </p>
      </div>

      {/* ---- Form panel ---- */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <h2 className="text-h2 font-semibold text-ink">Officer sign-in</h2>
          <p className="mt-1 text-body text-ink-secondary">
            Use the credentials issued by your department administrator.
          </p>

          <LoginForm
            nextPath={searchParams.next}
            showDemoHint={isDevelopment}
            extractionMode={extractionProvider}
          />
        </div>
      </div>
    </div>
  );
}
