#!/bin/sh
# Container startup: bring the schema up to date, then run both processes.
#
# Mirrors what `npm run stack:up` does locally, minus the parts a platform already
# handles (starting Postgres and Redis, waiting for them to be healthy).
set -e

echo "==> Legal Metrology Compliance Checker"
echo "    node $(node --version)  chromium $(chromium --version 2>/dev/null | head -n1)"

# Fail loudly and immediately on the two variables that have no usable default, rather
# than letting the app boot and produce a wall of confusing runtime errors.
if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set." >&2
  exit 1
fi
if [ -z "$JWT_SECRET" ]; then
  echo "FATAL: JWT_SECRET is not set. Generate one with:" >&2
  echo "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"" >&2
  exit 1
fi
if [ -z "$REDIS_URL" ]; then
  echo "WARNING: REDIS_URL is not set. Scans will save but never process." >&2
fi

# `migrate deploy` only applies migrations already committed to the repository. It
# never generates one and never resets, so it is safe to run on every boot.
echo "==> Applying database migrations"
npx prisma migrate deploy

# Off by default. Set SEED_ON_BOOT=true for a first deployment to create the demo
# accounts, then remove it — the seed is idempotent and only ever replaces scans
# belonging to the demo users, but it also resets their passwords to the published
# demo values, which is not something to do on every restart.
if [ "$SEED_ON_BOOT" = "true" ]; then
  # Reports are skipped by default. The seed renders eight PDFs through Puppeteer, and
  # this runs *before* the server starts — on a platform with a startup health check that
  # is long enough to have the first deploy marked as failed. Every report regenerates on
  # first download from the stored extraction, so nothing is lost by deferring them.
  # Set SEED_SKIP_REPORTS=0 to render them up front anyway.
  echo "==> Seeding demo data (reports deferred; they render on first download)"
  SEED_SKIP_REPORTS="${SEED_SKIP_REPORTS:-1}" npm run db:seed \
    || echo "WARNING: seeding failed; continuing without demo data" >&2
fi

echo "==> Starting web server and worker on port ${PORT:-3000}"

# `--kill-others-on-fail` so that if either process dies the container exits and the
# platform restarts it. Without it a dead worker leaves a healthy-looking web tier
# serving a queue nobody is consuming — scans stuck at "Queued" with no error anywhere.
exec npx concurrently \
  --names web,worker \
  --prefix-colors blue,magenta \
  --kill-others-on-fail \
  "npm run start -- -p ${PORT:-3000}" \
  "npm run worker"
