import IORedis, { type Redis } from 'ioredis';

import { env, isProduction } from '@/lib/env';

/**
 * Redis connections for BullMQ.
 *
 * Two distinct connections are needed, and mixing them up is the classic BullMQ
 * mistake:
 *
 *  - The **worker** blocks on `BRPOPLPUSH`, so ioredis must not abort a command
 *    after N retries. `maxRetriesPerRequest: null` is mandatory here; BullMQ
 *    throws on startup without it.
 *  - The **producer** (Next API routes) issues short commands and should fail
 *    fast so an unreachable Redis surfaces as a 5xx rather than a hung request.
 *
 * Both are cached on `globalThis` so Next's dev-server hot reloads don't pile up
 * connections until Redis refuses them.
 */
const globalForRedis = globalThis as unknown as {
  lmProducerRedis?: Redis;
  lmWorkerRedis?: Redis;
};

function baseOptions() {
  return {
    // Let BullMQ manage reconnection semantics; we only tune request behaviour.
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times: number) {
      // 200ms, 400ms, ... capped at 5s.
      return Math.min(times * 200, 5000);
    },
  };
}

export function getProducerConnection(): Redis {
  if (!globalForRedis.lmProducerRedis) {
    const client = new IORedis(env.REDIS_URL, {
      ...baseOptions(),
      maxRetriesPerRequest: 3,
      connectTimeout: 8_000,
    });
    client.on('error', (error) => {
      console.error('[queue] producer redis error:', error.message);
    });
    globalForRedis.lmProducerRedis = client;
  }
  return globalForRedis.lmProducerRedis;
}

export function getWorkerConnection(): Redis {
  if (!globalForRedis.lmWorkerRedis) {
    const client = new IORedis(env.REDIS_URL, {
      ...baseOptions(),
      // Required by BullMQ for blocking commands.
      maxRetriesPerRequest: null,
    });
    client.on('error', (error) => {
      console.error('[queue] worker redis error:', error.message);
    });
    globalForRedis.lmWorkerRedis = client;
  }
  return globalForRedis.lmWorkerRedis;
}

export async function closeRedisConnections(): Promise<void> {
  const clients = [globalForRedis.lmProducerRedis, globalForRedis.lmWorkerRedis].filter(
    (c): c is Redis => Boolean(c),
  );
  globalForRedis.lmProducerRedis = undefined;
  globalForRedis.lmWorkerRedis = undefined;

  await Promise.allSettled(clients.map((client) => client.quit()));
}

/** Quick health probe used by the admin panel and the dashboard banner. */
export async function pingRedis(): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const started = Date.now();
  try {
    await getProducerConnection().ping();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export const redisKeyPrefix = isProduction ? 'lm:prod' : 'lm:dev';
