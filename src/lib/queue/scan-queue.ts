import { Queue, type JobsOptions } from 'bullmq';

import { env } from '@/lib/env';

import { getProducerConnection } from './connection';

export const SCAN_QUEUE_NAME = 'label-scan';

/**
 * The job payload is intentionally tiny — just the scan id.
 *
 * Everything else (image key, product name, officer) is read from Postgres by
 * the worker. That keeps Redis from becoming a second, stale source of truth,
 * and means a retry always operates on the current state of the row.
 */
export interface ScanJobData {
  scanId: string;
  /** Which attempt this enqueue represents, used to build a stable job id. */
  attempt: number;
}

const globalForQueue = globalThis as unknown as { lmScanQueue?: Queue<ScanJobData> };

export function getScanQueue(): Queue<ScanJobData> {
  if (!globalForQueue.lmScanQueue) {
    globalForQueue.lmScanQueue = new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
      connection: getProducerConnection(),
      defaultJobOptions: defaultScanJobOptions(),
    });
  }
  return globalForQueue.lmScanQueue;
}

export function defaultScanJobOptions(): JobsOptions {
  return {
    attempts: Math.max(1, env.SCAN_JOB_ATTEMPTS),
    // 12s, 24s, 48s. A vision API answering 503 "high demand" is recovering on the
    // order of a minute, so the original 4s base gave up after 27 seconds and failed
    // scans that a slightly more patient retry would have completed.
    backoff: { type: 'exponential', delay: 12_000 },
    // Keep a rolling window for debugging without letting Redis grow unbounded.
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  };
}

/**
 * Enqueues processing for a scan.
 *
 * The job id is derived from the scan id *and* the attempt number, which makes a
 * double-submitted upload a no-op while still allowing an officer to legitimately
 * retry a failed scan.
 */
export async function enqueueScanJob(scanId: string, attempt = 1): Promise<string> {
  const jobId = `scan:${scanId}:${attempt}`;
  await getScanQueue().add('process-scan', { scanId, attempt }, { jobId });
  return jobId;
}

export interface QueueDepth {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

/** Surfaced on the admin panel so an operator can see the backlog. */
export async function getQueueDepth(): Promise<QueueDepth> {
  const queue = getScanQueue();
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);
  return { waiting, active, delayed, failed, completed };
}

export async function closeScanQueue(): Promise<void> {
  const queue = globalForQueue.lmScanQueue;
  globalForQueue.lmScanQueue = undefined;
  if (queue) await queue.close();
}
