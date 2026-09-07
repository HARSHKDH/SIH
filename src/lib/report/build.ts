import { ApiError } from '@/lib/api/errors';
import { extractionProvider } from '@/lib/env';
import { labelExtractionSchema } from '@/lib/extraction/schema';
import { prisma } from '@/lib/prisma';
import { evaluateCompliance } from '@/lib/rules';
import { storage } from '@/lib/storage';

import { buildImageDataUri, ruleBookSummary } from './assets';
import { describeScanSource } from './shared';
import type { ReportData } from './template';

/**
 * Assembles everything a report needs from a scan id.
 *
 * Both download routes (PDF and DOCX) call this, so the two artefacts are always built
 * from identical inputs — the same extraction, the same officer details, the same
 * attachments. Duplicating this assembly per format is exactly how two "copies" of one
 * report end up disagreeing.
 *
 * The rule engine is re-run over the *stored* extraction rather than reading back the
 * Violation rows. It is deterministic, so the findings are identical, and re-running
 * additionally recovers the per-clause audit trail (including the clauses that passed)
 * which the reports print but the schema has no need to store.
 */
export async function buildReportDataForScan(scanId: string): Promise<{
  data: ReportData;
  ownerId: string;
}> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designation: true,
          jurisdiction: true,
        },
      },
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: { fileName: true, caption: true, createdAt: true },
      },
    },
  });

  if (!scan) throw ApiError.notFound('Scan not found.');

  if (scan.status !== 'COMPLETED') {
    throw ApiError.conflict(
      'A report is only available once the scan has finished processing successfully.',
    );
  }

  const parsed = labelExtractionSchema.safeParse(scan.rawExtraction);
  if (!parsed.success) {
    throw ApiError.conflict(
      'This scan has no stored extraction to build a report from. Re-run the scan to regenerate it.',
    );
  }

  const extraction = parsed.data;
  const compliance = evaluateCompliance(extraction, scan.productName);

  // The photograph is evidence, so a report is still worth producing without it —
  // a missing object must not block the download.
  let imageBytes: Buffer | null = null;
  let imageContentType: string | null = null;
  try {
    const image = await storage.getObject(scan.imageKey);
    imageBytes = image.body;
    imageContentType = image.contentType;
  } catch {
    console.warn('[report] label image unavailable for embedding', { scanId });
  }

  const data: ReportData = {
    scan: {
      id: scan.id,
      productName: scan.productName,
      createdAt: scan.createdAt,
      processedAt: scan.processedAt,
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
    imageDataUri: imageBytes && imageContentType ? buildImageDataUri(imageBytes, imageContentType) : null,
    imageBytes,
    imageContentType,
    attachments: scan.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      caption: attachment.caption,
      createdAt: attachment.createdAt,
    })),
    sourceLabel: describeScanSource(scan),
    meta: {
      generatedAt: new Date(),
      // The provider that produced the original reading is not retained on the row, so
      // the report states plainly that it was rebuilt rather than guessing.
      extractionSource: extractionProvider,
      model: 'stored extraction',
      ruleBookSummary,
      regeneratedFromStoredExtraction: true,
    },
  };

  return { data, ownerId: scan.user.id };
}
