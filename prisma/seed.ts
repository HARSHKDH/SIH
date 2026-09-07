/**
 * Demo seed.
 *
 * Creates four accounts and ten scans so the dashboard, history, scan detail and
 * admin screens are all populated without a single live API call — which is exactly
 * what you want when demonstrating on conference wifi.
 *
 * Two things make this seed more than fixture data:
 *
 *  1. The scans use the **real** sample label images from `public/samples`, uploaded
 *     through the **real** storage driver. So the images load, the bounding-box overlay
 *     works, and the worker could genuinely re-process any of them.
 *  2. Declarations, violations and scores are produced by the **real** rule engine
 *     running over the archetype extractions — not hand-written. A seeded scan
 *     therefore cannot disagree with what the live pipeline would say about the same
 *     label, and adjusting a rule weight updates the demo data on the next seed.
 *
 * Idempotent: it upserts the demo accounts and replaces only the scans belonging to
 * them, so running it twice is safe and it never touches real data.
 *
 *   npm run db:seed
 *   SEED_SKIP_REPORTS=1 npm run db:seed   # skip Puppeteer, much faster
 */
import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Prisma, PrismaClient, type ScanStatus } from '@prisma/client';

import { hashPassword } from '../src/lib/auth/password';
import {
  DECLARATION_KEYS,
  DECLARATION_KEY_TO_PRISMA_TYPE,
  type LabelExtraction,
} from '../src/lib/extraction/schema';
import { mockArchetypeByName } from '../src/lib/extraction/mock';
import { buildImageDataUri, generateComplianceReport, ruleBookSummary } from '../src/lib/report';
import { closeBrowser } from '../src/lib/report/pdf';
import { evaluateCompliance } from '../src/lib/rules';
import { storage } from '../src/lib/storage';

const prisma = new PrismaClient();

const SKIP_REPORTS = process.env.SEED_SKIP_REPORTS === '1';
const SAMPLES_DIR = path.resolve(process.cwd(), 'public', 'samples');

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  {
    key: 'admin',
    name: 'S. Krishnan',
    email: 'admin@legalmetrology.gov.in',
    password: 'Admin@123',
    role: 'ADMIN' as const,
    designation: 'Controller of Legal Metrology',
    jurisdiction: 'State Headquarters',
    isActive: true,
  },
  {
    key: 'officer',
    name: 'A. Ramaswamy',
    email: 'officer@legalmetrology.gov.in',
    password: 'Officer@123',
    role: 'OFFICER' as const,
    designation: 'Inspector, Circle III',
    jurisdiction: 'Coimbatore District',
    isActive: true,
  },
  {
    key: 'officer2',
    name: 'M. Fernandes',
    email: 'm.fernandes@legalmetrology.gov.in',
    password: 'Officer@123',
    role: 'OFFICER' as const,
    designation: 'Inspector, Circle I',
    jurisdiction: 'North Goa District',
    isActive: true,
  },
  {
    key: 'officer3',
    // Deactivated on purpose, so the admin roster demonstrates revocation.
    name: 'R. Bhattacharya',
    email: 'r.bhattacharya@legalmetrology.gov.in',
    password: 'Officer@123',
    role: 'OFFICER' as const,
    designation: 'Inspector (transferred)',
    jurisdiction: 'Howrah District',
    isActive: false,
  },
];

type AccountKey = (typeof ACCOUNTS)[number]['key'];

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

interface ScanSpec {
  /** File in public/samples. */
  image: string;
  /** Extraction archetype from src/lib/extraction/mock.ts. */
  archetype: string;
  productName: string;
  owner: AccountKey;
  /** Whole days before now that the scan was recorded. */
  daysAgo: number;
  hourIst: number;
  status: Extract<ScanStatus, 'COMPLETED' | 'PENDING' | 'FAILED'>;
  officerNote?: string;
  failureReason?: string;
}

const SCANS: ScanSpec[] = [
  {
    image: 'label-turmeric-pouch.png',
    archetype: 'compliant-retail-pouch',
    productName: 'Sundar Turmeric Powder 500 g',
    owner: 'officer',
    daysAgo: 9,
    hourIst: 11,
    status: 'COMPLETED',
    officerNote:
      'Routine market inspection, Gandhipuram wholesale block. Packer had current stamping certificates on file. No action proposed.',
  },
  {
    image: 'label-basmati-rice.png',
    archetype: 'missing-mrp-and-care',
    productName: 'Greenleaf Basmati Rice 1 kg',
    owner: 'officer',
    daysAgo: 8,
    hourIst: 15,
    status: 'COMPLETED',
    officerNote:
      'Fourteen units of the same batch on the shelf, none carrying a retail sale price. Retailer states packs were received in this condition from the distributor. Distributor details taken for follow-up.',
  },
  {
    image: 'label-sparkling-water.png',
    archetype: 'illegible-small-print',
    productName: 'Anandi Lemon Sparkling Water 750 ml',
    owner: 'officer',
    daysAgo: 6,
    hourIst: 10,
    status: 'COMPLETED',
    officerNote:
      'Declarations legible only under magnification. Sample retained for measurement of printed cap-height.',
  },
  {
    image: 'label-smoked-salmon.png',
    archetype: 'imported-no-origin',
    productName: 'Fjordline Smoked Salmon 250 g',
    owner: 'officer',
    daysAgo: 5,
    hourIst: 17,
    status: 'COMPLETED',
    officerNote:
      'Imported chilled line. No importer address and no country of origin on the pack. Import documents requisitioned from the retailer.',
  },
  {
    image: 'label-nilgiri-tea.png',
    archetype: 'minor-defects-tea-pack',
    productName: 'Nilgiri Estate Orange Pekoe Tea 250 g',
    owner: 'officer',
    daysAgo: 4,
    hourIst: 12,
    status: 'COMPLETED',
    officerNote: 'Advisory issued to the packer regarding tax-inclusive wording on the next print run.',
  },
  {
    image: 'label-gel-pens.png',
    archetype: 'unitless-quantity',
    productName: 'Nova Gel Ink Pens (pack)',
    owner: 'officer',
    daysAgo: 3,
    hourIst: 16,
    status: 'COMPLETED',
    officerNote:
      'Net quantity printed as a bare numeral with no unit. Stationery aisle, four facings affected.',
  },
  {
    image: 'label-turmeric-pouch.png',
    archetype: 'compliant-retail-pouch',
    productName: 'Sundar Turmeric Powder 500 g (second premises)',
    owner: 'officer2',
    daysAgo: 2,
    hourIst: 11,
    status: 'COMPLETED',
  },
  {
    image: 'label-basmati-rice.png',
    archetype: 'missing-mrp-and-care',
    productName: 'Greenleaf Basmati Rice 1 kg (Panaji)',
    owner: 'officer2',
    daysAgo: 2,
    hourIst: 14,
    status: 'COMPLETED',
    officerNote: 'Same defect as the Coimbatore finding. Appears to be a batch-level printing issue.',
  },
  {
    image: 'label-sparkling-water.png',
    archetype: 'illegible-small-print',
    productName: 'Anandi Sparkling Water — reshoot pending',
    owner: 'officer',
    daysAgo: 0,
    hourIst: 9,
    status: 'FAILED',
    failureReason:
      'The label could not be read reliably from this photograph, so no compliance assessment was made. Reported problems: severe glare across the declaration panel; lower edge cut off. Re-take the photo square-on, in even light, with the whole panel in frame.',
  },
  {
    image: 'label-nilgiri-tea.png',
    archetype: 'minor-defects-tea-pack',
    productName: 'Nilgiri Estate Green Tea 100 g',
    owner: 'officer',
    daysAgo: 0,
    hourIst: 10,
    status: 'PENDING',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a timestamp `daysAgo` days back at the given IST hour. */
function timestamp(daysAgo: number, hourIst: number): Date {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourIst - 5, 30 - 30),
  );
  date.setUTCDate(date.getUTCDate() - daysAgo);
  // Never let a "today" scan land in the future — it would trip the trend buckets.
  return date.getTime() > now.getTime() ? new Date(now.getTime() - 90_000) : date;
}

/** The extraction stored against a scan that failed on image quality. */
function unreadableExtraction(base: LabelExtraction): LabelExtraction {
  return {
    ...base,
    image_assessment: {
      readable: false,
      is_packaged_commodity_label: true,
      issues: ['severe glare across the declaration panel', 'lower edge cut off'],
      detected_languages: [],
    },
    overall_notes: 'Photograph is unusable for adjudication.',
  };
}

async function uploadSample(file: string, index: number): Promise<{ key: string; url: string; bytes: Buffer }> {
  const bytes = await readFile(path.join(SAMPLES_DIR, file));
  const now = new Date();
  const key = `scans/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/seed-${String(
    index + 1,
  ).padStart(2, '0')}-${file}`;

  const stored = await storage.putObject({ key, body: bytes, contentType: 'image/png' });
  return { key: stored.key, url: stored.url, bytes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding demo data\n');

  // ---- Accounts ------------------------------------------------------------
  const users = new Map<AccountKey, { id: string; name: string; email: string }>();

  for (const account of ACCOUNTS) {
    const passwordHash = await hashPassword(account.password);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      // Re-running the seed restores the demo password and posting, but never
      // resurrects an account an administrator has since deactivated by hand
      // except for the one we deliberately ship deactivated.
      update: {
        name: account.name,
        passwordHash,
        role: account.role,
        designation: account.designation,
        jurisdiction: account.jurisdiction,
        isActive: account.isActive,
      },
      create: {
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
        designation: account.designation,
        jurisdiction: account.jurisdiction,
        isActive: account.isActive,
      },
      select: { id: true, name: true, email: true },
    });

    users.set(account.key, user);
    console.log(
      `  user   ${account.email.padEnd(40)} ${account.role.padEnd(7)} ${
        account.isActive ? '' : '(deactivated)'
      }`,
    );
  }

  // ---- Clear previous demo scans only -------------------------------------
  const demoUserIds = [...users.values()].map((user) => user.id);
  const removed = await prisma.scan.deleteMany({ where: { userId: { in: demoUserIds } } });
  if (removed.count > 0) console.log(`\n  cleared ${removed.count} previous demo scan(s)`);

  // ---- Scans ---------------------------------------------------------------
  console.log('');
  let reportsGenerated = 0;

  for (const [index, spec] of SCANS.entries()) {
    const owner = users.get(spec.owner);
    if (!owner) throw new Error(`unknown seed owner: ${spec.owner}`);

    const baseExtraction = mockArchetypeByName(spec.archetype);
    if (!baseExtraction) throw new Error(`unknown extraction archetype: ${spec.archetype}`);

    const { key, url, bytes } = await uploadSample(spec.image, index);
    const createdAt = timestamp(spec.daysAgo, spec.hourIst);

    // ---- Queued scan: nothing assessed yet ----
    if (spec.status === 'PENDING') {
      await prisma.scan.create({
        data: {
          imageKey: key,
          imageUrl: url,
          productName: spec.productName,
          status: 'PENDING',
          userId: owner.id,
          createdAt,
          updatedAt: createdAt,
        },
      });
      console.log(`  scan   PENDING    ${spec.productName}`);
      continue;
    }

    // ---- Failed scan: extraction retained as evidence, no findings ----
    if (spec.status === 'FAILED') {
      const processedAt = new Date(createdAt.getTime() + 24_000);
      await prisma.scan.create({
        data: {
          imageKey: key,
          imageUrl: url,
          productName: spec.productName,
          status: 'FAILED',
          userId: owner.id,
          failureReason: spec.failureReason,
          attemptCount: 2,
          rawExtraction: unreadableExtraction(baseExtraction) as unknown as Prisma.InputJsonValue,
          processingStartedAt: new Date(createdAt.getTime() + 3_000),
          processedAt,
          createdAt,
          updatedAt: processedAt,
        },
      });
      console.log(`  scan   FAILED     ${spec.productName}`);
      continue;
    }

    // ---- Completed scan: run the real rule engine ----
    const compliance = evaluateCompliance(baseExtraction, spec.productName);
    const processedAt = new Date(createdAt.getTime() + 31_000);

    const scan = await prisma.scan.create({
      data: {
        imageKey: key,
        imageUrl: url,
        productName: spec.productName,
        status: 'COMPLETED',
        userId: owner.id,
        complianceScore: compliance.score,
        officerNote: spec.officerNote ?? null,
        rawExtraction: baseExtraction as unknown as Prisma.InputJsonValue,
        attemptCount: 1,
        processingStartedAt: new Date(createdAt.getTime() + 2_000),
        processedAt,
        createdAt,
        updatedAt: processedAt,
        declarations: {
          create: DECLARATION_KEYS.map((declarationKey) => {
            const field = baseExtraction[declarationKey];
            return {
              type: DECLARATION_KEY_TO_PRISMA_TYPE[declarationKey],
              valueFound: field.value,
              confidence: field.confidence,
              boundingBox: (field.bounding_box ?? Prisma.DbNull) as Prisma.InputJsonValue,
              fontSizeEst: field.font_size_mm_est,
              createdAt: processedAt,
            };
          }),
        },
        violations: {
          create: compliance.violations.map((violation) => ({
            ruleCode: violation.ruleCode,
            ruleTitle: violation.ruleTitle,
            description: violation.description,
            severity: violation.severity,
            suggestedAction: violation.suggestedAction,
            // Violations are dated with the scan so the "this week" figures and the
            // trend chart line up with the scans that produced them.
            createdAt: processedAt,
          })),
        },
      },
      select: { id: true },
    });

    console.log(
      `  scan   COMPLETED  ${spec.productName.padEnd(46)} score ${String(compliance.score).padStart(
        3,
      )}  ${compliance.violations.length} finding(s)`,
    );

    // ---- Optional: pre-render the PDF so the demo download is instant ----
    if (!SKIP_REPORTS) {
      const account = ACCOUNTS.find((candidate) => candidate.key === spec.owner)!;
      try {
        const report = await generateComplianceReport({
          scan: {
            id: scan.id,
            productName: spec.productName,
            createdAt,
            processedAt,
            officerNote: spec.officerNote ?? null,
          },
          officer: {
            name: owner.name,
            email: owner.email,
            role: account.role,
            designation: account.designation,
            jurisdiction: account.jurisdiction,
          },
          extraction: baseExtraction,
          compliance,
          imageDataUri: buildImageDataUri(bytes, 'image/png'),
          meta: {
            generatedAt: processedAt,
            extractionSource: 'mock',
            model: 'mock-extractor',
            ruleBookSummary,
          },
        });

        await prisma.scan.update({
          where: { id: scan.id },
          data: { reportUrl: report.url, reportKey: report.key },
        });
        reportsGenerated += 1;
      } catch (error) {
        // A missing PDF is regenerable on demand, so never fail the seed over it.
        console.warn(
          `         (report skipped: ${error instanceof Error ? error.message : 'unknown error'})`,
        );
      }
    }
  }

  // ---- Summary -------------------------------------------------------------
  const [scanCount, violationCount, declarationCount] = await Promise.all([
    prisma.scan.count(),
    prisma.violation.count(),
    prisma.declaration.count(),
  ]);

  console.log(
    `\nDone. ${scanCount} scans, ${declarationCount} declarations, ${violationCount} violations` +
      `${SKIP_REPORTS ? ' (reports skipped)' : `, ${reportsGenerated} PDF reports`}.`,
  );
  console.log('\nSign in with:');
  console.log('  officer@legalmetrology.gov.in / Officer@123   (OFFICER)');
  console.log('  admin@legalmetrology.gov.in   / Admin@123     (ADMIN)\n');
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!SKIP_REPORTS) await closeBrowser();
    await prisma.$disconnect();
  });
