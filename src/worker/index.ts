// Loaded first so DATABASE_URL / REDIS_URL / GEMINI_API_KEY are present before
// any module reads `process.env`. Node's --env-file would also work, but an
// explicit import keeps `npm run worker` portable across Node versions.
import 'dotenv/config';

import { UnrecoverableError, Worker, type Job } from 'bullmq';

import {
  activeStorageDriver,
  env,
  extractionModel,
  extractionProvider,
  hasVisionProvider,
} from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { closeRedisConnections, getWorkerConnection } from '@/lib/queue/connection';
import { SCAN_QUEUE_NAME, closeScanQueue, type ScanJobData } from '@/lib/queue/scan-queue';
import { closeBrowser } from '@/lib/report';

import { log } from './logger';
import { markScanFailed, processScan, shouldRetry } from './process-scan';

/**
 * The scan worker.
 *
 * Runs as its own process alongside the Next server (`npm run worker`, or both
 * together with `npm run dev:all`). Keeping it separate is what stops a 20-second
 * vision call and a Chrome PDF render from blocking HTTP requests.
 */

function banner() {
  log.info('worker starting', {
    queue: SCAN_QUEUE_NAME,
    concurrency: env.WORKER_CONCURRENCY,
    attempts: env.SCAN_JOB_ATTEMPTS,
    extraction: hasVisionProvider
      ? `${extractionProvider} (${extractionModel})`
      : 'mock (no vision API key)',
    storage: activeStorageDriver,
    redis: env.REDIS_URL.replace(/\/\/[^@]*@/, '//***@'),
  });

  if (!hasVisionProvider) {
    log.warn(
      'No vision API key is set (GEMINI_API_KEY or ANTHROPIC_API_KEY) — running deterministic mock extraction. The queue, rule engine and PDF pipeline are fully exercised; only the vision call is substituted.',
    );
  }
}

async function handler(job: Job<ScanJobData>) {
  const { scanId } = job.data;
  const attemptsAllowed = job.opts.attempts ?? 1;

  try {
    return await processScan(scanId);
  } catch (error) {
    const retryable = shouldRetry(error);
    // `attemptsMade` counts runs already completed, so this run is the last one
    // when adding it to the current attempt reaches the configured ceiling.
    const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;

    if (!retryable || isFinalAttempt) {
      await markScanFailed(scanId, error);
      log.error('scan failed', {
        scanId,
        jobId: job.id ?? '-',
        retryable,
        attempt: job.attemptsMade + 1,
        of: attemptsAllowed,
        error,
      });
    } else {
      log.warn('scan attempt failed, will retry', {
        scanId,
        attempt: job.attemptsMade + 1,
        of: attemptsAllowed,
        error,
      });
    }

    // UnrecoverableError tells BullMQ to stop immediately instead of burning
    // the remaining attempts on an input that will never succeed.
    if (!retryable) {
      throw new UnrecoverableError(error instanceof Error ? error.message : 'unrecoverable failure');
    }
    throw error;
  }
}

const worker = new Worker<ScanJobData>(SCAN_QUEUE_NAME, handler, {
  connection: getWorkerConnection(),
  concurrency: Math.max(1, env.WORKER_CONCURRENCY),
  // A vision call plus a Chrome render can legitimately take a while; without a
  // generous lock BullMQ would consider the job stalled and re-run it.
  lockDuration: 180_000,
  stalledInterval: 60_000,
  maxStalledCount: 1,
});

worker.on('completed', (job, result) => {
  log.info('job completed', {
    jobId: job.id ?? '-',
    scanId: job.data.scanId,
    score: result?.score ?? '-',
    violations: result?.violations ?? '-',
    report: result?.reportGenerated ? 'yes' : 'no',
    ms: result?.durationMs ?? '-',
  });
});

worker.on('failed', async (job, error) => {
  if (!job) {
    log.error('job failed with no job reference', { error });
    return;
  }

  const attemptsAllowed = job.opts.attempts ?? 1;
  const exhausted = job.attemptsMade >= attemptsAllowed;

  // Safety net: if the processor could not write the FAILED state (for example
  // the DB blipped at exactly the wrong moment), do it here once BullMQ has
  // given up on the job.
  if (exhausted) {
    const scan = await prisma.scan
      .findUnique({ where: { id: job.data.scanId }, select: { status: true } })
      .catch(() => null);

    if (scan && scan.status !== 'COMPLETED' && scan.status !== 'FAILED') {
      await markScanFailed(job.data.scanId, error);
      log.warn('marked scan failed from worker listener', { scanId: job.data.scanId });
    }
  }
});

worker.on('error', (error) => {
  log.error('worker error', { error });
});

worker.on('ready', () => {
  log.info('worker ready and waiting for jobs');
});

banner();

// ---------------------------------------------------------------------------
// Graceful shutdown — finish in-flight jobs, then release Chrome, Redis and PG.
// ---------------------------------------------------------------------------
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down', { signal });

  try {
    await worker.close();
    await closeScanQueue();
    await closeBrowser();
    await closeRedisConnections();
    await prisma.$disconnect();
    log.info('shutdown complete');
    process.exit(0);
  } catch (error) {
    log.error('error during shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', { error: reason });
});
