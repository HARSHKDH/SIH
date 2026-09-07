import type { SystemStatusDto } from '@/lib/api/dto';
import {
  EXTRACTION_PROVIDER_LABEL,
  extractionModel,
  extractionProvider,
} from '@/lib/env';
import { getQueueDepth } from '@/lib/queue/scan-queue';
import { storageInfo } from '@/lib/storage';

/**
 * A snapshot of how the app is actually wired right now.
 *
 * Surfaced in the UI so nobody demoing or operating the system has to guess
 * whether they are looking at real vision extraction or the offline fallback, or
 * whether the worker has a reachable queue behind it. Silent degradation is the
 * enemy here — the app is designed to keep working without S3, without an API
 * key and (for reads) without Redis, so it has to say when it is doing so.
 */
export async function getSystemStatus(): Promise<SystemStatusDto> {
  let queue: SystemStatusDto['queue'] = null;

  try {
    const depth = await getQueueDepth();
    queue = {
      reachable: true,
      waiting: depth.waiting + depth.delayed,
      active: depth.active,
      failed: depth.failed,
    };
  } catch {
    queue = { reachable: false, waiting: 0, active: 0, failed: 0 };
  }

  return {
    storageDriver: storageInfo.driver,
    storageFallback: storageInfo.usingFallback,
    extractionMode: extractionProvider,
    extractionProviderLabel: EXTRACTION_PROVIDER_LABEL[extractionProvider],
    extractionModel,
    queue,
  };
}
