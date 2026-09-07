import { Prisma, type DeclarationType, type Severity } from '@prisma/client';

import {
  DECLARATION_KEYS,
  DECLARATION_KEY_TO_PRISMA_TYPE,
  ExtractionError,
  extractLabelDeclarations,
  isRetryable,
  toOfficerMessage,
  type ExtractionProvider,
  type LabelExtraction,
} from '@/lib/extraction';
import { prisma } from '@/lib/prisma';
import { buildImageDataUri, describeScanSource, generateComplianceReport, ruleBookSummary } from '@/lib/report';
import { assessInputSuitability, evaluateCompliance } from '@/lib/rules';
import { storage } from '@/lib/storage';

import { log } from './logger';

/** Raised when the scan should be failed without further retries. */
export class PermanentScanFailure extends Error {
  readonly officerMessage: string;
  constructor(officerMessage: string) {
    super(officerMessage);
    this.name = 'PermanentScanFailure';
    this.officerMessage = officerMessage;
  }
}

export interface ProcessScanOutcome {
  scanId: string;
  score: number;
  violations: number;
  reportGenerated: boolean;
  extractionSource: ExtractionProvider;
  durationMs: number;
}

/**
 * The pipeline, in the order the brief specifies:
 *
 *   PENDING -> PROCESSING
 *     -> read the image out of object storage
 *     -> vision extraction (forced JSON)
 *     -> deterministic rule engine -> violations + 0-100 score
 *     -> write Declaration and Violation rows, status COMPLETED
 *     -> render the PDF report and attach it
 *
 * The whole function is idempotent: re-running it on the same scan replaces the
 * previous declarations, violations and report rather than duplicating them,
 * which is what makes the retry button safe.
 */
export async function processScan(scanId: string): Promise<ProcessScanOutcome> {
  const startedAt = Date.now();

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      user: {
        select: { name: true, email: true, role: true, designation: true, jurisdiction: true },
      },
    },
  });

  if (!scan) {
    // The row is gone (deleted account, cleaned-up demo data). Nothing to retry.
    throw new PermanentScanFailure(`Scan ${scanId} no longer exists.`);
  }

  // ---- 1. Mark as processing -------------------------------------------------
  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      attemptCount: { increment: 1 },
      failureReason: null,
    },
  });

  log.info('processing started', { scanId, product: scan.productName ?? '-' });

  // ---- 2. Fetch the label image --------------------------------------------
  let imageBytes: Buffer;
  let imageContentType: string;
  try {
    const object = await storage.getObject(scan.imageKey);
    imageBytes = object.body;
    imageContentType = object.contentType;
  } catch (error) {
    log.error('image fetch failed', { scanId, key: scan.imageKey, error });
    throw new PermanentScanFailure(
      'The uploaded label image could not be read from storage. Please upload the photo again.',
    );
  }

  if (imageBytes.length === 0) {
    throw new PermanentScanFailure('The uploaded label image is empty. Please upload the photo again.');
  }

  // ---- 3. Vision extraction -------------------------------------------------
  // For a listing scan the captured page text is evidence in its own right: Rule 6(10)
  // requires the declarations on the product display page, so text-only declarations
  // are declarations. For a photographed pack there is no such text and this is null.
  const listingText = scan.source === 'ECOMMERCE_LISTING' ? scan.sourceText : null;

  const { extraction, meta } = await extractLabelDeclarations({
    imageBytes,
    productName: scan.productName,
    listingText,
  });

  log.info('extraction complete', {
    scanId,
    source: meta.source,
    model: meta.model,
    ms: meta.durationMs,
    ...(listingText ? { listingTextChars: listingText.length } : {}),
    ...(meta.archetype ? { archetype: meta.archetype } : {}),
  });

  // A photo we cannot read must not be turned into a page of "declaration
  // missing" findings — that would be a false accusation against the packer.
  const suitability = assessInputSuitability(extraction);
  if (!suitability.suitable) {
    await recordRawExtraction(scanId, extraction);
    throw new PermanentScanFailure(suitability.reason ?? 'The label could not be assessed from this photograph.');
  }

  // ---- 4. Rule engine -------------------------------------------------------
  const compliance = evaluateCompliance(extraction, scan.productName);

  log.info('rules evaluated', {
    scanId,
    score: compliance.score,
    violations: compliance.violations.length,
    critical: compliance.breakdown.criticalCount,
  });

  // ---- 5. Persist the assessment -------------------------------------------
  const processedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // Replace prior results so a retry is a clean re-assessment.
    await tx.declaration.deleteMany({ where: { scanId } });
    await tx.violation.deleteMany({ where: { scanId } });

    await tx.declaration.createMany({
      data: DECLARATION_KEYS.map((key) => {
        const field = extraction[key];
        return {
          scanId,
          type: DECLARATION_KEY_TO_PRISMA_TYPE[key] as DeclarationType,
          valueFound: field.value,
          confidence: field.confidence,
          boundingBox: (field.bounding_box ?? Prisma.DbNull) as Prisma.InputJsonValue,
          fontSizeEst: field.font_size_mm_est,
        };
      }),
    });

    if (compliance.violations.length > 0) {
      await tx.violation.createMany({
        data: compliance.violations.map((violation) => ({
          scanId,
          ruleCode: violation.ruleCode,
          ruleTitle: violation.ruleTitle,
          description: violation.description,
          severity: violation.severity as Severity,
          suggestedAction: violation.suggestedAction,
        })),
      });
    }

    await tx.scan.update({
      where: { id: scanId },
      data: {
        status: 'COMPLETED',
        complianceScore: compliance.score,
        rawExtraction: extraction as unknown as Prisma.InputJsonValue,
        processedAt,
        failureReason: null,
      },
    });
  });

  log.info('assessment stored', { scanId, score: compliance.score });

  // ---- 6. PDF report -------------------------------------------------------
  // Deliberately after COMPLETED: the assessment is the valuable output, and a
  // Chrome hiccup should not throw away a finished evaluation. A missing report
  // is regenerable from the stored extraction at any time.
  let reportGenerated = false;
  try {
    const report = await generateComplianceReport({
      scan: {
        id: scan.id,
        productName: scan.productName,
        createdAt: scan.createdAt,
        processedAt,
        officerNote: scan.officerNote,
      },
      officer: {
        name: scan.user.name,
        email: scan.user.email,
        role: scan.user.role,
        designation: scan.user.designation,
        jurisdiction: scan.user.jurisdiction,
      },
      extraction,
      compliance,
      imageDataUri: buildImageDataUri(imageBytes, imageContentType),
      sourceLabel: describeScanSource(scan),
      meta: {
        generatedAt: new Date(),
        extractionSource: meta.source,
        model: meta.model,
        ruleBookSummary,
      },
    });

    await prisma.scan.update({
      where: { id: scanId },
      data: { reportUrl: report.url, reportKey: report.key },
    });

    reportGenerated = true;
    log.info('report generated', { scanId, bytes: report.byteLength });
  } catch (error) {
    log.error('report generation failed (scan remains completed)', { scanId, error });
  }

  const durationMs = Date.now() - startedAt;
  log.info('processing finished', { scanId, ms: durationMs, score: compliance.score });

  return {
    scanId,
    score: compliance.score,
    violations: compliance.violations.length,
    reportGenerated,
    extractionSource: meta.source,
    durationMs,
  };
}

/** Keeps the model's output as evidence even when the scan cannot be assessed. */
async function recordRawExtraction(scanId: string, extraction: LabelExtraction): Promise<void> {
  await prisma.scan
    .update({
      where: { id: scanId },
      data: { rawExtraction: extraction as unknown as Prisma.InputJsonValue },
    })
    .catch(() => {
      /* best effort — the failure reason is what matters to the officer */
    });
}

/** Writes the terminal FAILED state and the message the officer will read. */
export async function markScanFailed(scanId: string, error: unknown): Promise<void> {
  const reason =
    error instanceof PermanentScanFailure ? error.officerMessage : toOfficerMessage(error);

  await prisma.scan
    .update({
      where: { id: scanId },
      data: { status: 'FAILED', failureReason: reason.slice(0, 1000), processedAt: new Date() },
    })
    .catch((updateError) => {
      log.error('could not mark scan as failed', { scanId, error: updateError });
    });
}

/** Whether BullMQ should bother trying this job again. */
export function shouldRetry(error: unknown): boolean {
  if (error instanceof PermanentScanFailure) return false;
  if (error instanceof ExtractionError) return error.retryable;
  return isRetryable(error);
}
