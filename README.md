# Legal Metrology Packaged Commodities Compliance Checker

**Smart India Hackathon — problem statement 26034**

Field software for Legal Metrology Officers. An officer photographs the declaration
panel of a pre-packaged commodity; the app transcribes the mandatory declarations,
tests them against the Legal Metrology (Packaged Commodities) Rules, 2011, and
produces a signed-off PDF record of what was found and which clause was breached.

---

## Contents

- [What it does](#what-it-does)
- [Problem statement coverage](#problem-statement-coverage)
- [Architecture](#architecture)
- [The pipeline](#the-pipeline)
- [The rule engine](#the-rule-engine)
- [Quick start](#quick-start)
- [Which API keys do I need?](#which-api-keys-do-i-need)
- [Environment variables](#environment-variables)
- [Running the worker alongside the web server](#running-the-worker-alongside-the-web-server)
- [Demo accounts](#demo-accounts)
- [Project layout](#project-layout)
- [Screens](#screens)
- [Design system](#design-system)
- [Scripts](#scripts)
- [Graceful degradation](#graceful-degradation)
- [Security notes](#security-notes)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## What it does

Seven declarations are mandatory on a retail package under Rule 6(1):

| Declaration | Clause |
| --- | --- |
| Name and complete address of the manufacturer, packer or importer | Rule 6(1)(a) |
| Net quantity in standard units | Rule 6(1)(c) |
| Retail sale price (MRP), inclusive of all taxes | Rule 6(1)(e) |
| Month and year of manufacture, packing or import | Rule 6(1)(d) |
| Consumer care details | Rule 6(1)(f) |
| Country of origin (imported commodities, and e-commerce listings) | Rule 6(1), 2017 amendment |
| Unit sale price, where sold by weight or measure | Rule 6(1) with Rule 2(m) |

The app reads them off a photograph — or off an e-commerce product page — applies
thirteen clause functions, and returns a 0–100 compliance score with every finding
attributed to the rule it came from.

Two kinds of subject can be inspected:

| Subject | How it is captured | Legal basis for assessing it |
| --- | --- | --- |
| A physical pack | Photograph of the declaration panel, taken in the field or uploaded | Rule 6(1) — declarations on the package |
| An e-commerce listing | The product page is fetched by URL; its primary image **and** its visible declaration text are captured | Rule 6(10) — an e-commerce entity must display the same declarations on the product display page |

For a listing, a declaration published as page text counts as declared, because the
subject of that assessment is the product display page rather than a printed panel.
Everything after capture — queue, rule engine, scoring, repository, reports — is
identical for both.

Reports come out as **PDF** (fixed, signature-ready) and **DOCX** (editable, for an
officer who must add a paragraph before filing), and the register exports to **CSV** for
spreadsheet analysis across a body of work.

---

## Problem statement coverage

Every capability named in SIH 26034, mapped to where it is implemented. Listed in the
order the problem statement gives them so it can be read side by side.

**System capabilities**

| Required | Where |
| --- | --- |
| Scanning and analysing images of packaged commodities | `src/lib/extraction/` + `src/worker/process-scan.ts` |
| Detecting mandatory declarations | `src/lib/extraction/schema.ts` — seven declaration fields, forced-JSON extraction |
| Checking **correctness** of declarations | `src/lib/rules/clauses/` — quantity units, tax wording, address completeness |
| Checking **completeness** of declarations | `src/lib/rules/clauses/identity.ts`, `quantity.ts`, `price.ts`, `dates.ts`, `origin.ts` |
| Checking **placement** of declarations | `src/lib/rules/clauses/placement.ts` — Rule 6(2), grouped at one place, judged from stored bounding boxes |
| Identifying missing or non-compliant declarations | Rule engine findings, severity-graded CRITICAL / MODERATE / MINOR |
| Checking readability and font size | `src/lib/rules/clauses/legibility.ts` — Rule 9(1), 9(2), and 9(3) with the Third Schedule |
| Generating compliance reports and violation summaries | `src/lib/report/` — PDF and DOCX from one shared builder |
| Maintaining a repository of scanned products and compliance history | `Scan`, `Declaration`, `Violation` tables; `/scans` register with filters |
| Dashboards for enforcement officials | `/dashboard` — trend, top violations, compliance rate; `/admin` for oversight |

**Expected solution**

| Required | Where |
| --- | --- |
| Web and/or mobile application | Next.js app, responsive, installable PWA with an offline page and a rear-camera capture path |
| Automated extraction and validation of declarations | Gemini vision extraction → zod validation → deterministic rules |
| Rule-based compliance checking | `src/lib/rules/` — thirteen clause functions, no DSL, no rule table |
| Reports in **PDF and editable formats** | `/api/scans/[id]/report` (PDF), `/api/scans/[id]/report/docx` (DOCX), `/api/scans/export` (CSV) |
| Dashboard for inspections, violations and compliance detail | `/dashboard`, `/admin/stats` |
| Search and retrieval of previous scans and reports | `/scans` — text search, status, severity, score range, date range, officer, sortable and paginated |
| Technical documentation of architecture and deployment | This file — [Architecture](#architecture), [Deployment](#deployment) |

**Key functional requirements**

| Required | Where |
| --- | --- |
| Image upload and product scanning | `/scans/new` — drag-drop, file picker, rear camera; presigned direct-to-storage upload |
| Extraction of declarations and detection of mandatory ones | `src/lib/extraction/prompt.ts` + `schema.ts` |
| Font size and readability analysis | `relative_text_sizes` estimates → Rule 9 clauses |
| Detection of missing, misleading or non-standard declarations | Rule 8 (non-metric units), Rule 6(1)(c) (unitless quantity), Rule 6(1)(e) (tax wording) |
| Generation of compliance / non-compliance reports | `src/lib/report/{template,docx}.ts` |
| **Attachment of photographs and supporting evidence** | `src/components/scans/attachment-panel.tsx`, `/api/scans/[id]/attachments` — multiple photos and PDFs per scan, listed in both reports |
| Repository of scanned products and inspection history | `/scans` + scan detail with full audit trail |
| Role-based access and secure authentication | `src/middleware.ts`, `src/lib/auth/`, `src/lib/api/scan-access.ts` — OFFICER sees own casework, ADMIN sees all |
| Dashboard for compliance status and enforcement activity | `/dashboard`, `/admin` |
| **Export of reports to PDF and editable formats** | DOCX per scan, CSV for the register |
| Compliance checking of **product listings** | `/api/scans/listing`, `src/lib/listing/` |

---

## Architecture

One Next.js codebase, two processes.

```
                    ┌──────────────────────────────────────────┐
   Officer's phone  │  Next.js 14 (App Router)                 │
   or desktop  ───► │  • server-rendered pages                 │
                    │  • /api route handlers                   │
                    │  • Edge middleware (JWT gate)            │
                    └───────┬──────────────────────┬───────────┘
                            │                      │
              presigned PUT │                      │ enqueue job
                            ▼                      ▼
                   ┌────────────────┐      ┌──────────────┐
                   │  S3 / local    │      │ Redis        │
                   │  object store  │      │ BullMQ queue │
                   └───────┬────────┘      └──────┬───────┘
                           │                      │
                           │      ┌───────────────▼──────────────┐
                           └─────►│  Worker process (tsx)        │
                                  │  1 vision extraction         │
                                  │  2 rule engine               │
                                  │  3 write findings            │
                                  │  4 Puppeteer → PDF           │
                                  └───────────────┬──────────────┘
                                                  ▼
                                          ┌───────────────┐
                                          │ PostgreSQL    │
                                          │ (Prisma)      │
                                          └───────────────┘
```

**Why Next.js API routes rather than a separate Express service.** The API surface is
small and every endpoint is consumed by this one frontend. Keeping them in the same
project means the DTOs in `src/lib/api/dto.ts` are the literal types the client
imports — a change to a response shape is a compile error in the component that reads
it, not a runtime surprise. There is nothing an Express app would add here except a
second deployment target and a second copy of the auth middleware.

**Why the worker is a separate process.** A vision API call takes seconds and a
Puppeteer render takes about a second. Both would occupy an HTTP worker for the whole
duration. Splitting them out means the web tier stays responsive, the queue absorbs
bursts, retries are free, and the two can be scaled independently.

**Why server components fetch directly, and the JSON API still exists.** Pages call
functions in `src/lib/queries/` directly — no HTTP hop, no loading spinner on first
paint. The `/api` routes call *the same functions*, so the PWA, a future mobile client
and the polling on the New Scan screen all get identical data. There is one
implementation of "compliance rate", not two that can drift.

### Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 14.2 (App Router), React 18, TypeScript (strict) |
| Styling | Tailwind CSS 3.4 with a fixed design-token theme |
| Database | PostgreSQL via Prisma 6 |
| Queue | Redis + BullMQ 5 |
| Storage | AWS S3 (presigned PUT), with a signed local-disk driver as fallback |
| Extraction | Google Gemini vision API (`gemini-3.5-flash`), forced-JSON via `responseJsonSchema`, with automatic model failover. Anthropic Claude supported as a drop-in alternative. |
| Auth | JWT in an httpOnly cookie, signed with `jose` (HS256), roles OFFICER / ADMIN |
| PDF | Puppeteer rendering an HTML template |
| Charts | Recharts |

---

## The pipeline

Implemented in `src/worker/process-scan.ts`, in exactly this order.

**1 — Intake.** Two paths, converging on the same `Scan` row.

*A photograph:* the browser asks `POST /api/uploads/presign` for a target, PUTs the bytes
straight to storage, then calls `POST /api/scans` with the returned key. The image never
passes through the Node process.

*A listing:* `POST /api/scans/listing` fetches the product page through the SSRF guard,
extracts its primary image and visible declaration text, and stores that image under the
same `scans/` prefix a photograph would use. The capture is synchronous, deliberately — a
typo, a paywall or a script-rendered page has to be a message on the form, not a scan that
looks queued and fails a minute later with something the officer cannot act on.

Either way a `Scan` row is created with status `PENDING` and a BullMQ job is enqueued
carrying only the scan id — Redis never becomes a second source of truth. From here the
two paths are indistinguishable apart from `Scan.source`, `sourceUrl` and `sourceText`.

**2 — Extraction.** The worker sets `PROCESSING`, reads the object back, and calls
Gemini's vision API. For a listing scan the captured page text is passed alongside the
image and the prompt switches mode: under Rule 6(10) a declaration published on the
product display page counts as declared, so text-only declarations are recorded as
present with a null bounding box rather than reported missing. JSON is *forced*, not
requested: the response shape is declared as
a tool input schema and `tool_choice` pins the model to that one tool, so there is no
prose to parse and no fenced code block to strip. The system prompt (`src/lib/extraction/prompt.ts`)
is emphatic on one point — **never invent a value that cannot be read**. A missing
declaration is the finding; a plausible invented manufacturer address would be a false
accusation. The model also returns a `relative_text_sizes` block including
`smallest_appears_illegible`, and an `image_assessment` block. The result is validated
with zod before anything downstream sees it.

**3 — Suitability gate.** If the photo is unreadable or is not a package label at all,
the scan is failed with an explanation rather than run through the rules. Running the
rule book against a blurry photo would produce a page of "declaration missing"
violations that say nothing about the package.

**4 — Rule engine.** `evaluateCompliance` runs the thirteen clause functions and scores
the result. Deterministic, no model involvement.

**5 — Persistence.** `Declaration` and `Violation` rows are written in one transaction,
which first deletes any prior rows for the scan — so a retry is a clean re-assessment
rather than an append. The scan is set to `COMPLETED` with its score and the verbatim
extraction JSON retained as evidence.

**6 — Report.** Puppeteer renders the HTML template to a PDF, which is stored and
attached to the scan. This step runs *after* `COMPLETED` on purpose: a Chrome hiccup
should not throw away a finished assessment, and a missing PDF is regenerable from the
stored extraction at any time (`GET /api/scans/:id/report` does exactly that).

**Failure handling.** Failures are classified. Transient ones (rate limit, timeout,
5xx) are retried by BullMQ with exponential backoff. Permanent ones (HEIC upload,
unreadable photo, deleted image) raise `UnrecoverableError` so the remaining attempts
are not burned on an input that will never succeed. Either way the scan ends up
`FAILED` with an officer-readable `failureReason` and a working **Retry** button.

---

## The rule engine

`src/lib/rules/` — thirteen clauses, one function each, no DSL. 115 total weight.

```
clauses/identity.ts    Rule 6(1)(a) manufacturer name + address     weight 18
                       Rule 6(1)(f) consumer care details           weight 11
clauses/quantity.ts    Rule 6(1)(c) net quantity                    weight 18
                       Rule 8       prescribed metric units         weight  6
clauses/price.ts       Rule 6(1)(e) retail sale price               weight 18
                       Rule 6(1)(e) "inclusive of all taxes"        weight  4
                       Rule 6(1)    unit sale price                 weight  3
clauses/dates.ts       Rule 6(1)(d) month and year                  weight 11
clauses/origin.ts      Rule 6(1)    country of origin               weight  7
clauses/placement.ts   Rule 6(2)    declarations grouped at one place weight 5
clauses/legibility.ts  Rule 9(1)    legible and prominent           weight  6
                       Rule 9(2)    1 mm minimum letter height      weight  4
                       Rule 9(3)    numeral height vs. panel area   weight  4
```

A clause is a plain object with a `code`, a statutory `reference`, a `weight` and an
`evaluate(ctx)` function that returns either `null` or one finding. Adding a clause
means writing one function and adding one line to `registry.ts`. Deliberately not a
rule DSL and not a database-driven rule table: a finding on screen traces straight to
reviewable, unit-testable TypeScript, which is what makes it defensible when contested.

**Scoring.**

```
score = 100 × (applicableWeight − lostWeight) / applicableWeight
```

Two properties matter. Clauses that **could not be assessed** — no panel-area estimate,
no price to check tax wording against — are excluded from the denominator rather than
counted as passes, so the score never flatters a label by accident. And every point is
attributable: `ComplianceResult.outcomes` carries per-clause detail for all thirteen
clauses including the passes, which is what Section D of the PDF prints.

**Bands.** Severity leads, the number follows. Any critical finding means the package
cannot read as compliant however well it scores elsewhere, and `COMPLIANT` requires
*zero* findings, so the badge can never contradict the violations listed beneath it.

Some judgement calls are documented in the code rather than hidden:

- **Country of origin** strictly bites on imported packages, and a photograph cannot
  prove import. The clause always reports the omission but grades it by evidence —
  MODERATE when something on the label points to an import (a non-Indian language, a
  foreign country named, no Indian PIN code), MINOR otherwise — and quotes the signals
  it used so the officer can judge for themselves.
- **Rule 9(1) legibility** is the one clause that leans on the model's judgement rather
  than a measurement, because legibility is a qualitative test in the rule itself:
  contrast, background clutter and print quality all matter, not just height.
- **Rule 6(2) placement** is the only clause that judges *where* declarations sit rather
  than whether they exist, and the bounding boxes stored for every declaration are what
  make it possible. It applies two tests, because "not grouped" has two distinct
  geometries: a **leave-one-out separation** test, where the reference block is built
  from the *other* declarations so a stray one cannot drag the reference towards itself;
  and a **dispersion** test comparing declaration area against the area they span, which
  catches text flung to the corners. A photograph is a flat projection of a
  three-dimensional pack, so apparent distance is not proof of a separate panel — the
  finding is therefore MINOR and names the specific declaration, so the officer verifies
  a concrete claim against the package rather than trusting a score. It abstains
  entirely below four located declarations.

---

## Quick start

### Prerequisites

- Node.js ≥ 20.11
- Docker (for PostgreSQL and Redis), or your own PostgreSQL ≥ 14 and Redis ≥ 6
- **No API key required to run** — see [Which API keys do I need?](#which-api-keys-do-i-need)

### One command

After the one-time setup below, this is all you need:

```bash
npm run stack:up
```

It starts Docker Desktop if it is not running, brings up PostgreSQL and Redis and
**waits for both to pass a health check** rather than merely to exist, applies any
pending migrations, then starts the web server and the worker together.

The waiting is the point. Started in the wrong order, the worker boots against a
database that is not yet accepting queries and the failure reads like an application
bug. Ctrl-C stops the app and deliberately leaves PostgreSQL and Redis running, since
there is no reason to discard a warm database between runs.

### Setup

```bash
# 1. Install dependencies (Puppeteer downloads a Chrome build, ~150 MB)
npm install

# 2. Configure
cp .env.example .env
#    Set DATABASE_URL and REDIS_URL, then generate a secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    ...and paste it into JWT_SECRET.

# 3. Start PostgreSQL and Redis
docker compose up -d --wait

# 4. Create the schema
npm run db:migrate

# 5. Load demo data (4 accounts, 10 scans, 8 pre-rendered PDF reports)
npm run db:seed

# 6. From now on, just this
npm run stack:up
```

Open <http://localhost:3000> and sign in with the credentials below.

`GET /api/health` reports whether the database, Redis, storage and extraction are all
wired up.

---

## Which API keys do I need?

**One, and it's free.** Everything else the project needs runs locally.

| # | What | Cost | Why | Required? |
| --- | --- | --- | --- | --- |
| 1 | **Google Gemini API key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Free tier, no credit card | Reads the label text from the photograph | **Recommended.** Without it the app runs on the offline extractor and everything else still works |
| 2 | PostgreSQL | Free (Docker locally) | Stores scans, findings, accounts | Yes |
| 3 | Redis | Free (Docker locally) | Job queue between the web tier and the worker | Yes |
| 4 | `JWT_SECRET` | Free — you generate it | Signs session cookies | Yes |

That's the whole list. Getting the Gemini key takes about a minute: sign in with a
Google account, click **Create API key**, paste it into `.env` as `GEMINI_API_KEY`,
restart. No billing setup, no cloud project, no card.

### Deliberately *not* required

| Not needed | Why |
| --- | --- |
| AWS / S3 account | A signed local-disk driver mirrors presigned-URL semantics. Set the `AWS_*` variables only if you want real object storage. |
| A separate OCR service (Google Vision, Tesseract, AWS Textract) | Gemini reads the text *and* estimates print sizes and layout in one call. A separate OCR pass would give you characters without the spatial and legibility judgement Rule 9 needs. |
| Any paid PDF service | Puppeteer renders locally. |
| Auth provider (Auth0, Clerk, Firebase) | Accounts are issued by a department administrator, not self-service signup, so a hosted identity provider would add a dependency and a monthly bill for no benefit. |
| Maps, SMS, email providers | Not used. |

### Getting the most out of it

If you want the strongest demo, in priority order:

1. **Set `GEMINI_API_KEY`.** This is the single change that turns the app from
   "convincing simulation" into "genuinely reads a label you photograph". Take a photo
   of a real packet from your kitchen and run it — that is the moment the project sells
   itself.
2. **Leave everything else on the local defaults.** Local disk storage and Docker
   Postgres/Redis are one less thing to fail on stage, and the app tells you honestly
   which mode it is in.
3. **Only add S3** if you specifically want to show cloud storage. It changes one line
   of config and nothing else.

### Model choice and 503s

`GEMINI_MODEL` defaults to **`gemini-3.5-flash`**, not the newest flagship. That is a
measured decision, not caution for its own sake.

Flash-tier is right for the job: label transcription is high-volume,
latency-sensitive, and needs accurate reading rather than frontier reasoning. But the
*newest* Flash model is also the most capacity-constrained on the free tier. In testing,
`gemini-3.8-flash` returned `503 — "this model is currently experiencing high demand"`
repeatedly, while `gemini-3.5-flash` answered every request in under four seconds and
transcribed identically. Leading with the flagship cost about 30 seconds per scan before
failing over, for no gain in accuracy.

Two mechanisms handle a capacity spike, and they operate at different timescales:

1. **Model failover, within the same job.** On a 503 or 429 the extractor immediately
   tries the next model in `GEMINI_FALLBACK_MODELS` rather than waiting. The model that
   actually served the request is logged and recorded on the scan, so the record stays
   truthful about what read the label. A *non*-capacity error (bad key, malformed
   request) is not retried against other models — it would fail identically on all of
   them, and burning quota to prove that is pointless.
2. **Queue backoff, across jobs.** If every model in the chain is unavailable, BullMQ
   retries the whole job with exponential backoff (12s, 24s, 48s). The earlier 4s base
   gave up after 27 seconds, which was simply too impatient for a condition that
   resolves on the order of a minute.

If a scan still fails, it lands in `FAILED` with the reason shown to the officer and a
working **Retry** button — no work is lost.

To trade a little accuracy for more headroom, put `gemini-3.5-flash-lite` first: it was
the fastest model tested at roughly 1.7 seconds.

---

## Environment variables

Only `DATABASE_URL`, `REDIS_URL` and `JWT_SECRET` are required. Everything else has a
working default.

### Required

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://lm:lmpassword@localhost:5433/legal_metrology?schema=public` |
| `REDIS_URL` | e.g. `redis://localhost:6379`. Needed by both the web tier (to enqueue) and the worker (to consume). |
| `JWT_SECRET` | Session signing key, **minimum 32 characters**. Generate with the command above. Rotating it invalidates every session. |

### Extraction

| Variable | Default | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | *(empty)* | **The only key the project needs.** Free from [AI Studio](https://aistudio.google.com/apikey), no card. Leave blank to run the deterministic offline extractor. |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Primary vision model. Deliberately not the newest flagship — see [Model choice and 503s](#model-choice-and-503s). |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.5-flash-lite,gemini-3.8-flash` | Comma-separated. Tried in order when the primary returns 503 "high demand" or 429. |
| `GEMINI_MAX_OUTPUT_TOKENS` | `8192` | Output ceiling for one extraction. A truncated response is invalid JSON, not a shorter answer, so the scan fails outright — listing scans annotate more fields than photographs and were the case that overran the previous 4096. Billing is on tokens produced, so the headroom is free. |
| `EXTRACTION_PROVIDER` | `auto` | `auto` picks Gemini, then Claude, then the offline extractor. Force one with `gemini`, `claude` or `mock`. |
| `ANTHROPIC_API_KEY` | *(empty)* | Only needed if you choose Claude instead of Gemini. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | |
| `ANTHROPIC_MAX_TOKENS` | `2048` | |

### Storage — S3, or local disk

| Variable | Default | Notes |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local` or `s3`. |
| `LOCAL_STORAGE_PATH` | `./storage` | Used by the local driver. Git-ignored. |
| `AWS_REGION` | `ap-south-1` | |
| `AWS_S3_BUCKET` | *(empty)* | |
| `AWS_ACCESS_KEY_ID` | *(empty)* | |
| `AWS_SECRET_ACCESS_KEY` | *(empty)* | |
| `AWS_S3_ENDPOINT` | *(empty)* | Set for MinIO, Cloudflare R2 or another S3-compatible service. |
| `AWS_S3_FORCE_PATH_STYLE` | `false` | Usually `true` for MinIO. |

S3 is only used when `STORAGE_DRIVER=s3` **and** the bucket and both credentials are
present. Otherwise the app falls back to local disk and says so in the UI.

### Auth, app and worker

| Variable | Default | Notes |
| --- | --- | --- |
| `JWT_EXPIRES_IN` | `8h` | Accepts `45m`, `8h`, `7d` or a plain number of seconds. Sized to a working shift. |
| `APP_BASE_URL` | `http://localhost:3000` | |
| `NEXT_PUBLIC_APP_NAME` | `Legal Metrology Compliance Checker` | |
| `WORKER_CONCURRENCY` | `3` | Jobs processed in parallel per worker process. |
| `SCAN_JOB_ATTEMPTS` | `3` | Attempts before a scan is failed permanently. |
| `PUPPETEER_EXECUTABLE_PATH` | *(empty)* | Point at a system Chrome instead of the bundled build. |

---

## Running the worker alongside the web server

The worker is a **separate process** and scans stay `PENDING` for ever without it.

**Both at once (recommended in development).** Uses `concurrently`, with prefixed and
colour-coded output:

```bash
npm run dev:all
```

**Separately**, in two terminals:

```bash
npm run dev          # terminal 1 — Next.js dev server on :3000
npm run dev:worker   # terminal 2 — worker with file watching (tsx watch)
```

**In production**, run the two as independent services:

```bash
npm run build
npm run start        # web
npm run worker       # worker (scale this out horizontally as load requires)
```

The worker prints its configuration on boot, so it is obvious what it is going to do:

```
2026-09-06T15:33:02.708Z | INFO  | worker starting | queue=label-scan concurrency=3
    attempts=3 extraction="mock (no vision API key)" storage=local redis=redis://localhost:6379
2026-09-06T15:33:02.774Z | INFO  | worker ready and waiting for jobs
```

and one line per pipeline stage while processing:

```
INFO | processing started   | scanId=cmtp… product="Fjordline Smoked Salmon 250 g"
INFO | extraction complete  | scanId=cmtp… source=mock model=mock-extractor ms=1
INFO | rules evaluated      | scanId=cmtp… score=51 violations=6 critical=0
INFO | assessment stored    | scanId=cmtp… score=51
INFO | report generated     | scanId=cmtp… bytes=404854
INFO | processing finished  | scanId=cmtp… ms=1847 score=51
```

It shuts down gracefully on `SIGINT`/`SIGTERM`: in-flight jobs are allowed to finish,
then Chrome, Redis and the Prisma pool are released.

`npm run worker` can be scaled to as many processes as you like — BullMQ distributes
jobs and `processScan` is idempotent per scan.

---

## Demo accounts

Created by `npm run db:seed`.

| Role | Email | Password |
| --- | --- | --- |
| Officer | `officer@legalmetrology.gov.in` | `Officer@123` |
| Admin | `admin@legalmetrology.gov.in` | `Admin@123` |
| Officer (second circle) | `m.fernandes@legalmetrology.gov.in` | `Officer@123` |
| Officer (deactivated, to demonstrate revocation) | `r.bhattacharya@legalmetrology.gov.in` | `Officer@123` |

Login is role-aware: officers land on the dashboard, admins on the administration panel.

**The seed is worth a look before a demo.** It is not fixture data — it uploads the real
sample label images from `public/samples/` through the real storage driver, and it
generates declarations, violations and scores by running the **real rule engine** over
the archetype extractions. A seeded scan therefore cannot disagree with what the live
pipeline would say about the same label, and changing a rule weight updates the demo
data on the next seed. It is idempotent (it upserts the demo accounts and replaces only
their scans), so it never touches real data.

Ten scans are created: eight completed across the full range of outcomes (100, 94, 75,
71, 70, 51), one `FAILED` with a retryable reason, and one `PENDING`.

```bash
SEED_SKIP_REPORTS=1 npm run db:seed   # skip the 8 Puppeteer renders — much faster
```

---

## Project layout

```
prisma/
  schema.prisma            User, Scan, Declaration, Violation, Attachment + enums
  migrations/              generated SQL migration history
  seed.ts                  demo data, built with the real rule engine
docker-compose.yml         PostgreSQL + Redis for local development
scripts/
  stack.mjs                one-command startup: Docker, services, migrations, app
  generate-assets.ts       regenerates PWA icons + the 6 mock label images
  check-rules.ts           scores every mock archetype through the real rule book
  check-listing.ts         SSRF address/URL classification + listing parser checks
public/
  manifest.webmanifest     PWA manifest with app shortcuts
  sw.js                    hand-written service worker (never caches /api)
  offline.html             standalone offline page
  icons/, samples/         generated by scripts/generate-assets.ts
src/
  middleware.ts            Edge JWT gate + /admin role gate
  app/
    layout.tsx             metadata, viewport, service-worker registration
    login/                 sign-in screen
    (app)/                 authenticated area — shares the sidebar shell
      dashboard/  scans/  scans/new/  scans/[id]/  admin/
    api/
      auth/{login,logout,me}
      uploads/{presign,local}       two-step upload
      files/[...key]                authenticated object read
      scans/                        create + list
      scans/listing                 capture an e-commerce product page
      scans/export                  the register as CSV
      scans/[id]/{,retry,report}    detail, note, retry, PDF
      scans/[id]/report/docx        editable Word report
      scans/[id]/attachments/       supporting evidence: presign, record, delete
      stats/dashboard  admin/{users,users/[id],stats}  health
  components/
    ui/                    Button, Card, Badge, Field, Table, ScoreGauge, …
    layout/                Sidebar, TopBar, AppShell, icons
    dashboard/  scans/  admin/  pwa/
  lib/
    env.ts                 zod-validated environment
    prisma.ts              client singleton
    auth/                  password hashing, JWT, session resolution
    storage/               driver interface + s3 / local + key safety + signing + sniffing
    extraction/            prompt, schema, gemini.ts, claude.ts, offline extractor
    listing/               SSRF guard, pinned-DNS fetcher, HTML/JSON-LD parser
    rules/                 clauses/, parsers, registry, engine
    report/                shared builder → PDF (Puppeteer), DOCX, CSV
    queue/                 Redis connections + BullMQ queue
    queries/               shared reads used by pages *and* API routes
    api/                   DTOs, serialisers, zod schemas, access control
    design/tokens.ts       palette as plain values (PDF + charts)
  worker/
    index.ts               BullMQ worker, retry policy, graceful shutdown
    process-scan.ts        the six pipeline stages
```

---

## Screens

**Login** — split layout, role-aware redirect. In development it also lists the seeded
credentials and states whether extraction is live or offline.

**Dashboard** — total scans, in progress, violations this week, compliance rate; a
seven-day activity chart; a live system panel; recent scans; and the most breached
clauses ranked. Fully server-rendered.

**New scan** — two modes, chosen with a tablist because the choice is about *what is
being inspected*, not which part of the app to visit. **Photograph a pack:** drag-and-drop
at a desk, or `capture="environment"` straight to the rear camera on a phone.
**E-commerce listing:** paste the product page URL; the capture reports back what it
actually found — the page, the title as published, how much text was read and how many
lines bear on Rule 6 — so a thin capture is visible before the assessment rather than
after. Optional product name either way, stated on the form to be context only and never
treated as evidence a declaration exists. After submit, a four-stage progress panel
mirroring the worker's steps, polled until the job reaches a terminal state. The inactive
mode is unmounted rather than hidden, so a URL can never be submitted while a photograph
is still selected.

**Scan detail** — the photograph with the extracted regions overlaid; hovering a
declaration row highlights it on the image, which is the fastest way to sanity-check a
reading before signing a report. Alongside it: the verbatim transcription with per-field
confidence (low-confidence readings are called out), the findings with rule code,
severity and recommended action, the Rule 9 legibility assessment, and the officer's
note. A listing scan names its source URL in the header, so it is never mistaken for a
first-hand observation of a pack. **Supporting evidence** takes multiple photographs and
PDFs — a second angle, a shelf shot, an invoice — each with a caption recording what a
reader is meant to notice; adding or removing one discards any cached PDF so the stored
report can never list evidence the record no longer holds. Reports download as
**PDF report** and **Editable (.docx)**. A failed scan shows the reason and a **Retry**
button.

**Scan history** — searchable and filterable by product, status, severity, score range,
date and (for admins) officer, with pagination. Filter state lives in the URL, so a
filtered view is shareable and back-button-correct, and the filtering happens in
Postgres. **Export CSV** carries the active filters, so the export is exactly what the
screen is showing rather than a different dataset under the same name.

**Admin** — violations aggregated by rule type with statutory references, score
distribution, officer activity, and account management. Accounts are deactivated rather
than deleted, because `Scan.userId` cascades and deleting an officer would erase their
inspection history. Deactivation revokes access on the officer's next request. The
server refuses to let an admin deactivate themselves, demote themselves, or remove the
last active administrator.

**PWA** — installable, with app shortcuts to New scan and Scan history. The service
worker caches the shell and build assets and serves an offline page for navigations, but
**never caches `/api`**: scan findings and reports are evidence, and a stale compliance
verdict from a cache would be worse than showing nothing.

---

## Design system

Enforcement software, not a consumer app. The palette is deliberately restrained and
lives in `tailwind.config.ts` and `src/lib/design/tokens.ts`.

| Token | Value | Use |
| --- | --- | --- |
| `brand` | `#1E3A5F` | Sidebar, primary buttons, active nav, report masthead |
| `brand-hover` | `#2C5282` | Hover and accent |
| `canvas` | `#F7F8FA` | Page background — never pure white on large surfaces |
| `surface` | `#FFFFFF` | Cards on the canvas |
| `ink` | `#1A202C` | Primary text |
| `ink-secondary` | `#4A5568` | Secondary text |
| `line` | `#E2E8F0` | Borders and dividers |
| `compliant` | `#2F6E4E` | Muted forest green |
| `moderate` | `#B7791F` | Muted amber |
| `critical` | `#9B2C2C` | Muted brick red |
| `neutralBadge` | `#718096` | Slate grey, used for minor findings |

Depth comes from hairline borders, not shadows. Type hierarchy is shallow — one `h1` at
1.375rem and a `stat` size for dashboard figures, nothing else above body. Minor
findings use slate rather than amber, so amber keeps its meaning: something an officer
should act on. `src/lib/design/tokens.ts` is the single source of truth shared by the
Tailwind theme, the Recharts series and the Puppeteer report template, which is what
stops the printed PDF drifting away from the screen it came from.

No gradients as surfaces, no glassmorphism, no neon.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run stack:up` | **Everything.** Starts Docker if needed, waits for PostgreSQL and Redis to be healthy, applies migrations, then runs the web server and worker |
| `npm run stack:down` | Stops PostgreSQL and Redis, keeping their data |
| `npm run stack:logs` | Follows the PostgreSQL and Redis logs |
| `npm run dev` | Next.js dev server alone |
| `npm run dev:worker` | Worker alone, with file watching |
| `npm run dev:all` | Both app processes, assuming the databases are already up |
| `npm run build` | `prisma generate` then `next build` |
| `npm run start` | Production web server |
| `npm run worker` | Production worker |
| `npm run db:migrate` | Create and apply a migration (development) |
| `npm run db:migrate:deploy` | Apply pending migrations (production) |
| `npm run db:push` | Push the schema without a migration |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npx tsx scripts/generate-assets.ts` | Regenerate PWA icons and the mock label images |
| `npx tsx scripts/check-rules.ts` | Score every mock archetype through the real rule book — catches unintended changes to weights or clause coverage |
| `npx tsx scripts/check-listing.ts` | Verify the SSRF address classifier and the listing parser. Offline and deterministic; kept because an early version of the classifier silently failed to match every CIDR whose first octet was ≥ 128, including the cloud metadata range |
| `npx tsx scripts/check-listing-mode.ts` | Prove the Rule 6(10) behaviour: runs one label image through the real extractor twice, as a photograph and as a listing, and asserts that declarations published only as page text are recorded with a null bounding box while nothing is invented. Needs `GEMINI_API_KEY` and refuses to run against the offline extractor, which ignores the prompt |
| `node scripts/e2e-verify.mjs` | End-to-end check of the DOCX report, CSV export, attachments and listing capture against a running instance. Opens the DOCX as a zip and parses the CSV rather than trusting status codes. Writes test attachments, so use a development database |

There is deliberately no script for wiping the database. To start completely fresh —
**this destroys every scan, finding and account** — run it by hand so it cannot happen
by accident, then re-seed:

```bash
docker compose down -v && docker compose up -d --wait && npm run db:migrate && npm run db:seed
```

---

## Graceful degradation

The app is built to keep working when a dependency is absent — and, just as
importantly, to **say so**. Silent degradation is the failure mode to avoid in
compliance software, so the active configuration is shown on the dashboard, in the
admin panel, in the top bar and in the worker's boot log.

| Missing | Behaviour |
| --- | --- |
| Vision API key | A deterministic offline extractor runs instead, keyed off a hash of the image bytes so the same photo always yields the same verdict. The queue, rule engine, scoring, database writes and PDF all run exactly as in production — only the vision call is substituted. An amber "Offline extraction mode" banner is shown throughout, and the PDF states which extractor produced it. |
| S3 credentials | Local disk, through a signed, key-pinned, short-lived PUT that mirrors presigned-URL semantics — so the frontend upload code is identical and swapping to S3 is a config change. |
| Redis | Reads all work. New scans are saved but not queued; the API returns a warning, the dashboard shows a red banner, and **Retry** works once Redis is back. |
| Chrome / Puppeteer | The assessment still completes; only the PDF is missing, and it is regenerated on first download. The DOCX and CSV exports do not use Chrome at all, so editable reports keep working. |
| Outbound network access | Photograph scanning is unaffected. Listing capture reports that the page could not be fetched and tells the officer to photograph the pack instead. |

---

## Security notes

- **Sessions.** HS256 JWT in an httpOnly, `SameSite=Lax` cookie, `Secure` in
  production. Edge middleware verifies the signature; `getSessionUser` then re-reads the
  user row, so an account deactivated by an admin loses access on the next request
  rather than at token expiry.
- **Passwords.** bcrypt via `bcryptjs` (pure JS, so no native build toolchain), cost 10.
- **Login.** Fixed-window rate limit, 10 attempts per 5 minutes per client. One error
  message and one code path for "no such user", "wrong password" and "deactivated
  account", so officers cannot be enumerated. The limiter is in-process; behind a load
  balancer it should move to Redis, which is already a dependency.
- **Access control.** In `src/lib/api/scan-access.ts`, one place to audit. An officer
  sees only their own scans; an admin can read everything but cannot amend another
  official's note or re-run their scan. Requesting someone else's scan returns 404, not
  403, so the API cannot be used to discover that a scan exists. `/admin` is gated in
  middleware *and* in every admin route handler.
- **Uploads.** Four independent checks before a byte is written: a valid session, a valid
  signed token that pins exactly one key and content type, a size cap, and a magic-byte
  check that the file really is what it claims. A caller cannot choose their own storage
  key or overwrite another officer's object. The token also pins the upload's *purpose*,
  which selects the size ceiling and the accepted media types — so a grant issued for a
  supporting document cannot be spent as a scan image, or the reverse. Label photographs
  are capped at 12 MB and must be JPEG/PNG/WebP; attachments at 15 MB and may also be PDF.
- **Supporting evidence.** With S3 configured the browser PUTs straight at the bucket and
  nothing in this process sees the bytes, so the *record* step re-reads the stored object
  and re-sniffs its magic bytes before an `Attachment` row is written. That is the only
  type check an S3 upload gets, which is why it is not treated as redundant. Adding or
  removing evidence discards any cached PDF, because a stored report listing different
  evidence than the record it documents would be worse than no stored report.
- **Storage keys.** Validated against a strict pattern and resolved against the storage
  root on every read and write, so `..`, backslashes and absolute paths cannot escape.
  Scan images must sit under the `scans/` prefix, and an attachment key must be one the
  target scan's own prefix could have produced. A user-supplied filename never reaches a
  path — it is slugified for the key and kept verbatim only on the database row.
- **Listing capture (SSRF).** `/api/scans/listing` is the only place a user-chosen URL
  causes an outbound request, so it is the only place SSRF is possible. Four defences, in
  `src/lib/listing/`: HTTPS only, no embedded credentials, port 443 only; every address
  the hostname resolves to must be public unicast, checked against an explicit table of
  loopback, RFC 1918, carrier-NAT, link-local, benchmarking, documentation, multicast and
  reserved ranges plus their IPv6 and IPv4-mapped equivalents; the validated address is
  *pinned* by handing a custom `lookup` to the socket, which closes the DNS-rebinding
  window that validating-then-refetching would leave open; and every redirect hop is
  re-validated, since a public URL that 302s to `https://127.0.0.1` would otherwise walk
  straight past a check applied only to the URL the officer typed. Literal IP addresses
  are refused up front, because Node skips the `lookup` hook entirely when the host is
  already an IP. Responses are bounded by a streamed byte cap (never by `Content-Length`,
  which a hostile server can understate) and a wall-clock deadline, and the request
  carries no cookies or referer. `scripts/check-listing.ts` holds the classification
  table as a runnable check.
- **Captured listing text is fenced in the prompt.** It comes off a page controlled by
  the party under inspection, making it the one model input with a motive to attempt
  prompt injection. It is delimited by an unambiguous marker, that marker is stripped
  from the captured text before fencing, and the model is told explicitly that the fenced
  content is evidence to be read rather than instructions to follow.
- **Object reads** go through an authenticated route rather than a public bucket, so
  evidence images are never world-readable by URL.
- **Report rendering.** Every interpolated value is HTML-escaped. Label text comes from
  a model reading arbitrary packaging and is treated as untrusted input.
- **Redirects.** `?next=` is honoured only for same-origin absolute paths.

---

## Deployment

### What this app needs from a platform

Two things rule out most "connect your repo" hosts, so it is worth being explicit:

1. **An always-on process.** The worker is a queue consumer, not a request handler. On a
   function platform there is nothing to run it, so every scan stays `PENDING` for ever:
   the site loads, login works, and nothing is ever assessed.
2. **Shared storage between the web tier and the worker.** The worker renders the PDF and
   the web tier serves it. Separate filesystems mean the worker cannot read the image the
   web tier just received.

Consequently: **Netlify and Vercel cannot host this on their own.** They can serve the web
tier, but the half that does the work has to live somewhere else.

### The shape that works

A `Dockerfile` is included that runs **both processes in one container**, supervised by
`concurrently`. That is what keeps shared storage working with no code change, and it is
why local-disk storage is still viable in production. The tradeoff is that the two cannot
scale independently — see [Scaling past one instance](#scaling-past-one-instance).

Any platform that runs a container plus managed PostgreSQL and Redis will do. Railway is
used below because it does all three from one repository.

### Railway, step by step

1. **Push to GitHub**, then at [railway.app](https://railway.app) create a project and
   choose *Deploy from GitHub repo*. The `Dockerfile` and `railway.json` are detected
   automatically; the health check is already configured to `/api/health`.
2. **Add PostgreSQL** and **Add Redis** from the project's *New* menu.
3. **Set the variables** on the app service. Reference the databases rather than pasting
   their URLs, so a credential rotation does not break the app:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `JWT_SECRET` | a fresh 32+ character secret (command below) |
   | `GEMINI_API_KEY` | your key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
   | `NODE_ENV` | `production` |
   | `LOCAL_STORAGE_PATH` | `/app/storage` |
   | `SEED_ON_BOOT` | `true` for the first deploy only, then delete it |

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Attach a volume** to the app service, mounted at `/app/storage`. Without it, every
   uploaded photograph and generated report is lost on each redeploy.
5. **Generate a domain** under *Settings → Networking*. Railway terminates TLS, which
   matters: in production the session cookie is issued `Secure`, so login silently fails
   over plain HTTP. Nothing is misconfigured if that happens — it is the cookie doing its
   job.
6. Open the URL and sign in. With `SEED_ON_BOOT=true` the demo accounts exist; remove the
   variable afterwards, because re-seeding resets those passwords to the published values.

The entrypoint applies `prisma migrate deploy` on every boot, so a schema change ships
with the deploy and needs no separate step.

### Verifying a deployment

```bash
curl https://your-app.up.railway.app/api/health
E2E_BASE_URL=https://your-app.up.railway.app node scripts/e2e-verify.mjs
```

`/api/health` returns 503 when PostgreSQL or Redis is unreachable, so it doubles as the
load-balancer probe. The e2e script writes test attachments, so point it at a staging
instance rather than a live register.

### Testing the image locally first

```bash
docker build -t lm-app .
docker compose up -d --wait

docker run --rm -p 3100:3000 \
  --network legal-metrology_default \
  -e DATABASE_URL="postgresql://lm:lmpassword@postgres:5432/legal_metrology" \
  -e REDIS_URL="redis://redis:6379" \
  -e JWT_SECRET="at-least-thirty-two-characters-long-secret" \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  lm-app
```

Stop the local worker first (`npm run stack:down` leaves the databases up). Two workers on
one Redis with unshared storage will fight over jobs, and the loser fails with "the
uploaded label image could not be read from storage" — which looks like a container fault
and is not one.

### Scaling past one instance

The single-container shape is deliberate but not permanent. To split the worker onto its
own service, or to run more than one replica, storage has to become shared object storage
— at which point the local disk is the only blocker, and the driver already handles it:

| Variable | Value |
| --- | --- |
| `STORAGE_DRIVER` | `s3` |
| `AWS_S3_BUCKET` | bucket name |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | credentials |
| `AWS_S3_ENDPOINT` | required for Cloudflare R2 or MinIO; omit for AWS |
| `AWS_S3_FORCE_PATH_STYLE` | `true` for R2 and MinIO |

Because a custom endpoint and path-style addressing are already supported, **Cloudflare R2
works with no code change** and has a 10 GB free tier. With that set, run one service on
`npm run start` and another on `npm run worker` from the same image, and scale the worker
independently. `WORKER_CONCURRENCY` controls parallelism within a single process.

### Alternative: one small VM

If you would rather not use a PaaS, a single VM running `docker compose` gives the closest
possible parity with local development — the same two containers, plus this image, sharing
a Docker volume. It is also the cheapest option on providers with a free tier. It costs you
TLS setup (Caddy or Nginx with Let's Encrypt), which the PaaS route does for free.

The worker's container needs Chrome's shared libraries. `--no-sandbox` and
`--disable-dev-shm-usage` are already set, which is what containers require.

---

## Known limitations

Stated plainly, because a compliance tool that overclaims is worse than one that does not.

- **One panel per scan.** Declarations printed on a panel not captured in the photograph
  cannot be assessed. The report says so explicitly. Supporting evidence can be attached
  to record other panels, but attachments are not put through the extractor — they are
  corroborating material for the officer, listed in the report, not a second assessment.
- **Listing capture runs no JavaScript.** A product page that assembles its content in
  the browser will yield little or nothing. Every major Indian marketplace serves product
  metadata in the initial HTML because search engines need it, which is what makes the
  feature worthwhile — but when a capture comes back thin the officer is told so on the
  form and can photograph the pack instead. A headless browser would read those pages;
  it was not used because it turns a two-second capture into a heavyweight, easily
  fingerprinted one, and the fallback is already sound.
- **A listing is evidence of what was published, not of what is on the pack.** A seller
  can edit a listing minutes later, so the capture records the URL, the image source and
  the capture timestamp, and the report names the listing rather than implying the
  physical package was inspected.
- **Rule 6(2) placement is a screening signal.** A photograph flattens a
  three-dimensional pack, so what looks like a distant declaration may be around a
  corner. The clause therefore reports MINOR and names the declaration for the officer to
  check, and it abstains when fewer than four declarations were located.
- **Millimetre estimates are estimates.** The model infers physical size from visual
  cues in the image. Rule 9(2) and 9(3) findings should be confirmed with a physical
  measurement before enforcement action, and the report frames them accordingly.
- **Standard pack sizes (Rule 5 and the Second Schedule) are not checked.** That
  requires the commodity category, which is not reliably determinable from a label
  photograph.
- **Country of origin cannot be proven from a photograph.** The clause reports the
  omission and grades it by the evidence available, rather than asserting import status.
- **Rule codes prefixed `LM-PCR-` are internal identifiers** for the clause referenced
  in each finding, not official citations. The statutory reference is printed in full
  alongside every code.
- **Not a statutory notice.** The PDF is a screening record for an officer to verify and
  sign. It is not a notice, determination or order under the Legal Metrology Act, 2009,
  and it says so on its face.
- **Automated tests are not included** in this build. The rule engine is written as pure
  functions specifically so that clause-level unit tests are straightforward to add, and
  that is the first thing to do next.
