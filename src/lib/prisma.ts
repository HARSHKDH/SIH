import { PrismaClient } from '@prisma/client';

import { isProduction } from '@/lib/env';

/**
 * A single PrismaClient per process.
 *
 * Next's dev server hot-reloads modules on every edit; without caching on
 * `globalThis` each reload would open a fresh connection pool until Postgres
 * refused new clients. The worker process benefits from the same singleton.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
