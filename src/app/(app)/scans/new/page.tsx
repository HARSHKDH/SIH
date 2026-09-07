import type { Metadata } from 'next';

import { ScanIntake } from '@/components/scans/scan-intake';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { DECLARATION_LABEL, DECLARATION_RULE_REF } from '@/lib/labels';
import { DECLARATION_KEYS } from '@/lib/extraction/schema';

export const metadata: Metadata = { title: 'New scan' };
export const dynamic = 'force-dynamic';

/**
 * Capture screen.
 *
 * The checklist on the right is not decoration: it tells the officer what the tool is
 * about to look for, so a photograph that crops off the consumer-care block gets
 * retaken before it is submitted rather than after it comes back with a false
 * "not declared" finding.
 */
export default function NewScanPage() {
  return (
    <>
      <PageHeader
        title="Record a new scan"
        description="Photograph the declaration panel of a pre-packaged commodity, or paste an e-commerce listing address. Either way the declarations are transcribed, then tested against the Packaged Commodities Rules, 2011."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ScanIntake />
        </div>

        <aside className="min-w-0 space-y-4">
          <Card as="aside">
            <CardHeader title="What is checked" as="h3" />
            <CardBody className="py-2">
              <ul className="divide-y divide-line">
                {DECLARATION_KEYS.map((key) => (
                  <li key={key} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="text-body text-ink">{DECLARATION_LABEL[key]}</span>
                    <span className="shrink-0 font-mono text-micro text-ink-muted">
                      {DECLARATION_RULE_REF[key]}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card as="aside">
            <CardHeader title="Getting a usable photograph" as="h3" />
            <CardBody>
              <ol className="space-y-2.5 text-body text-ink-secondary">
                {[
                  'Hold the camera square-on to the panel, not at an angle.',
                  'Fill the frame with the label, but keep all four edges inside it.',
                  'Avoid direct flash on glossy or foil packaging — glare hides fine print.',
                  'If declarations are split across panels, photograph the one carrying the mandatory block.',
                  'Where print is very small, get close enough that it is readable on your screen.',
                ].map((tip, index) => (
                  <li key={tip} className="flex gap-2.5">
                    <span
                      className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-brand-muted text-micro font-semibold text-brand"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
