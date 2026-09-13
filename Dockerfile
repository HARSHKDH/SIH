# Production image: the web server and the worker, in one container.
#
# ## Why both processes together
#
# The worker renders the PDF report and the web tier serves it back, so the two must
# see the same filesystem. Split across separate services they would not, and a
# platform volume can usually attach to only one service — which would force a move to
# S3 before anything worked at all. Running both here keeps the local-disk storage
# driver functioning exactly as it does in development, so a deployment behaves like
# the machine it was built on rather than approximately like it.
#
# The honest tradeoff: the two cannot be scaled independently, and a crash in one
# restarts both. For a single-instance deployment that is the right trade. To scale the
# worker separately later, set the S3 variables and split this into two services — the
# storage driver already supports that and needs no code change.
#
# ## Why a Dockerfile rather than a buildpack
#
# Puppeteer needs a real Chrome. Buildpacks do not install one, and Puppeteer's own
# ~150 MB download is wasteful when the distribution ships a working Chromium.
#
# ## Why two stages
#
# Docker layers are additive, so deleting build artefacts in a later layer does not
# reclaim the space — the earlier layer still ships. The build toolchain and the webpack
# cache are therefore left behind in a discarded stage rather than deleted in place.
#
# Base image note: `node:20-bookworm-slim` is deliberately avoided. It fails on some
# Docker versions with "exec /usr/local/bin/docker-entrypoint.sh: exec format error"
# before any instruction here runs, reproducibly and on a fresh pull with the platform
# pinned, while `debian:bookworm-slim`, `node:20-bookworm` and this tag all work — so it
# is a defect in that image, not an architecture mismatch. Debian rather than Alpine so
# glibc is present: Prisma's query engine would otherwise need a musl `binaryTargets`
# entry, and Puppeteer is better supported here.

# ---------------------------------------------------------------------------
# Stage 1 — build. Nothing from this stage ships except the artefacts copied out.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

# Puppeteer's bundled Chrome download is skipped; the runtime stage installs the
# distribution's Chromium instead and points at it with PUPPETEER_EXECUTABLE_PATH.
#
# NODE_ENV is deliberately not "production" here: `npm ci` would then skip the
# devDependencies that `next build` needs.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# openssl is required by the Prisma engine, including at generate time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependencies as their own layer, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

# The Prisma client is generated from the schema, so the schema lands before the rest
# of the source to keep this layer cacheable too.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# `next build` evaluates the module graph, which reads src/lib/env.ts. Every variable
# there has a working default precisely so that a build needs no real environment.
RUN npm run build

# Drop the webpack cache (~130 MB of build state) and the build-only dependencies
# before this tree is copied into the runtime stage.
#
# `tsx`, `prisma` and `concurrently` are declared as regular dependencies rather than
# rescued from this prune, because all three genuinely execute in production: the worker
# runs TypeScript directly, migrations are applied on boot, and both processes are
# supervised by concurrently. Calling them dev dependencies was only accurate while this
# app ran exclusively from a developer's machine.
RUN rm -rf .next/cache \
    && npm prune --omit=dev \
    && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2 — runtime.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium plus fonts. The fonts are not padding: the report prints the rupee sign and
# transcribes label text verbatim, and Indian packaging is routinely bilingual. Without
# Devanagari and Indic coverage those characters render as empty boxes in the PDF —
# evidence quietly corrupted at the last step.
#
# tini becomes PID 1 and reaps the Chrome processes Puppeteer leaves behind; without it
# they accumulate as zombies until the container runs out of process slots.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-dejavu-core \
        fonts-noto-core \
        fonts-indic \
        ca-certificates \
        openssl \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# The worker is executed from source by tsx, so src and tsconfig.json (for the `@/*`
# path aliases) are runtime requirements, not build leftovers.
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/next.config.mjs /app/tsconfig.json /app/prisma.config.ts ./

# Local-disk storage target. Mount a persistent volume here, or set the S3 variables
# and this stays empty.
RUN mkdir -p /app/storage
VOLUME ["/app/storage"]

EXPOSE 3000

RUN chmod +x /app/scripts/docker-entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
