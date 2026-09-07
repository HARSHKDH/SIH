import { NextResponse } from 'next/server';

import { withRoute } from '@/lib/api/errors';
import { getSystemStatus } from '@/lib/api/system-status';
import { prisma } from '@/lib/prisma';
import { pingRedis } from '@/lib/queue/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — unauthenticated liveness/readiness probe.
 *
 * Intentionally public but intentionally thin: it reports whether each dependency
 * answers, and nothing about the data inside them. No connection strings, no
 * counts, no version numbers that would help someone fingerprint the deployment.
 */
export const GET = withRoute(async () => {
  const [database, redis, system] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => ({ ok: true }))
      .catch(() => ({ ok: false })),
    pingRedis().then((result) => ({ ok: result.ok, latencyMs: result.latencyMs })),
    getSystemStatus(),
  ]);

  const ok = database.ok && redis.ok;

  return NextResponse.json(
    {
      ok,
      checks: {
        database,
        redis,
        storage: { driver: system.storageDriver, fallback: system.storageFallback },
        extraction: { mode: system.extractionMode },
      },
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
});
