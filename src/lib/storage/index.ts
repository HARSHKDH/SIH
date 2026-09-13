import { activeStorageDriver, s3IsConfigured } from '@/lib/env';

import { localStorage } from './local';
import { s3Storage } from './s3';
import type { StorageDriver } from './types';

/**
 * The single storage handle used by routes, the worker and the PDF writer.
 *
 * S3 is used when a bucket and credentials are configured; otherwise the app
 * silently falls back to local disk so it runs end-to-end on a laptop with no
 * cloud account. `storageInfo` surfaces which one is live for the admin panel.
 */
export const storage: StorageDriver = activeStorageDriver === 's3' ? s3Storage : localStorage;

export const storageInfo = {
  driver: activeStorageDriver,
  s3Configured: s3IsConfigured,
  /** True when running on the local-disk fallback rather than real object storage. */
  usingFallback: activeStorageDriver === 'local',
} as const;

export * from './keys';
export * from './types';
