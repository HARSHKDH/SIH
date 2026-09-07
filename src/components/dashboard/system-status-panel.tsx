import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SystemStatusDto } from '@/lib/api/dto';

/**
 * How the deployment is actually wired.
 *
 * The app is built to degrade rather than fall over — no S3 means local disk, no API
 * key means the offline extractor, no Redis means scans queue up instead of vanishing.
 * That is only defensible if the degradation is *visible*, which is what this panel is
 * for. It is also the fastest way to answer "is the worker running?" during a demo.
 */
export function SystemStatusPanel({ system }: { system: SystemStatusDto }) {
  const rows = [
    {
      label: 'Extraction',
      value:
        system.extractionMode === 'mock'
          ? 'Offline extractor'
          : `${system.extractionProviderLabel} vision API`,
      detail: system.extractionModel,
      tone: system.extractionMode === 'mock' ? ('moderate' as const) : ('compliant' as const),
      status: system.extractionMode === 'mock' ? 'Fallback' : 'Live',
    },
    {
      label: 'Object storage',
      value: system.storageDriver === 's3' ? 'AWS S3' : 'Local disk',
      detail:
        system.storageDriver === 's3'
          ? 'Presigned uploads direct to the bucket'
          : 'LOCAL_STORAGE_PATH, served through /api/files',
      tone: system.storageDriver === 's3' ? ('compliant' as const) : ('moderate' as const),
      status: system.storageDriver === 's3' ? 'Live' : 'Fallback',
    },
    {
      label: 'Processing queue',
      value: system.queue?.reachable ? 'Redis reachable' : 'Redis unreachable',
      detail: system.queue?.reachable
        ? `${system.queue.waiting} waiting · ${system.queue.active} active · ${system.queue.failed} failed`
        : 'New scans cannot be processed until Redis and the worker are running',
      tone: system.queue?.reachable ? ('compliant' as const) : ('critical' as const),
      status: system.queue?.reachable ? 'Live' : 'Down',
    },
  ];

  return (
    <Card>
      <CardHeader title="System" description="Live configuration of this deployment" as="h3" />
      <CardBody className="space-y-3.5 py-3.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-micro font-semibold uppercase tracking-wider text-ink-muted">
                {row.label}
              </p>
              <p className="mt-0.5 text-body font-medium text-ink">{row.value}</p>
              <p className="mt-0.5 text-label text-ink-muted">{row.detail}</p>
            </div>
            <Badge tone={row.tone} className="mt-0.5 shrink-0">
              {row.status}
            </Badge>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
