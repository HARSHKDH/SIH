import { Prisma } from '@prisma/client';

import {
  DECLARATION_ORDER,
  PRISMA_TYPE_TO_DECLARATION_KEY,
  boundingBoxSchema,
  labelExtractionSchema,
  type PrismaDeclarationType,
} from '@/lib/extraction/schema';
import {
  DECLARATION_LABEL,
  DECLARATION_RULE_REF,
  type AttachmentKindKey,
  type ScanSourceKey,
  type ScanStatusKey,
} from '@/lib/labels';
import { complianceBand } from '@/lib/rules/engine';
import type { RuleSeverity } from '@/lib/rules/types';

import type {
  AdminUserDto,
  AttachmentDto,
  DeclarationDto,
  ScanDetailDto,
  ScanSummaryDto,
  ViolationCountsDto,
  ViolationDto,
} from './dto';

/**
 * Prisma selections, declared once and shared by every route that returns a scan.
 *
 * Using `satisfies` rather than a plain object keeps the inferred payload types
 * exact, so the serialisers below cannot drift out of sync with the query.
 */
export const scanSummarySelect = {
  id: true,
  productName: true,
  status: true,
  complianceScore: true,
  createdAt: true,
  processedAt: true,
  imageUrl: true,
  reportKey: true,
  failureReason: true,
  user: { select: { id: true, name: true } },
  violations: { select: { severity: true } },
} satisfies Prisma.ScanSelect;

export const scanDetailSelect = {
  ...scanSummarySelect,
  officerNote: true,
  attemptCount: true,
  rawExtraction: true,
  declarations: {
    select: {
      id: true,
      type: true,
      valueFound: true,
      confidence: true,
      boundingBox: true,
      fontSizeEst: true,
    },
  },
  violations: {
    select: {
      id: true,
      ruleCode: true,
      ruleTitle: true,
      description: true,
      severity: true,
      suggestedAction: true,
    },
  },
  source: true,
  sourceUrl: true,
  attachments: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      fileName: true,
      fileUrl: true,
      contentType: true,
      byteSize: true,
      caption: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ScanSelect;

export type ScanSummaryRow = Prisma.ScanGetPayload<{ select: typeof scanSummarySelect }>;
export type ScanDetailRow = Prisma.ScanGetPayload<{ select: typeof scanDetailSelect }>;

// ---------------------------------------------------------------------------

export function countSeverities(violations: ReadonlyArray<{ severity: RuleSeverity }>): ViolationCountsDto {
  const counts: ViolationCountsDto = { critical: 0, moderate: 0, minor: 0, total: violations.length };
  for (const violation of violations) {
    if (violation.severity === 'CRITICAL') counts.critical += 1;
    else if (violation.severity === 'MODERATE') counts.moderate += 1;
    else counts.minor += 1;
  }
  return counts;
}

/** Only a finished assessment gets a band — a pending scan has no verdict yet. */
function bandFor(
  status: ScanStatusKey,
  score: number | null,
  counts: ViolationCountsDto,
): ScanSummaryDto['band'] {
  if (status !== 'COMPLETED' || score === null) return null;
  return complianceBand({
    score,
    criticalCount: counts.critical,
    moderateCount: counts.moderate,
    minorCount: counts.minor,
  });
}

export function toScanSummary(row: ScanSummaryRow, options: { includeOfficer?: boolean } = {}): ScanSummaryDto {
  const counts = countSeverities(row.violations);
  const status = row.status as ScanStatusKey;

  return {
    id: row.id,
    productName: row.productName,
    status,
    complianceScore: row.complianceScore,
    band: bandFor(status, row.complianceScore, counts),
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    imageUrl: row.imageUrl,
    hasReport: Boolean(row.reportKey),
    failureReason: row.failureReason,
    violationCounts: counts,
    officer: options.includeOfficer === false ? null : { id: row.user.id, name: row.user.name },
  };
}

function toDeclaration(row: ScanDetailRow['declarations'][number]): DeclarationDto {
  const key = PRISMA_TYPE_TO_DECLARATION_KEY[row.type as PrismaDeclarationType];
  const box = boundingBoxSchema.safeParse(row.boundingBox);

  return {
    id: row.id,
    key,
    label: DECLARATION_LABEL[key],
    ruleRef: DECLARATION_RULE_REF[key],
    valueFound: row.valueFound,
    confidence: row.confidence,
    boundingBox: box.success ? box.data : null,
    fontSizeEst: row.fontSizeEst,
  };
}

function toViolation(row: {
  id: string;
  ruleCode: string;
  ruleTitle: string;
  description: string;
  severity: RuleSeverity;
  suggestedAction: string | null;
}): ViolationDto {
  return {
    id: row.id,
    ruleCode: row.ruleCode,
    ruleTitle: row.ruleTitle,
    description: row.description,
    severity: row.severity,
    suggestedAction: row.suggestedAction,
  };
}

/**
 * Media types the browser will render inline, so the panel knows whether to show a
 * thumbnail or a file icon. Kept deliberately narrower than what the upload accepts:
 * a PDF is viewable in a new tab but not as an `<img>`.
 */
const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function toAttachment(row: ScanDetailRow['attachments'][number]): AttachmentDto {
  return {
    id: row.id,
    kind: row.kind as AttachmentKindKey,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    contentType: row.contentType,
    byteSize: row.byteSize,
    caption: row.caption,
    createdAt: row.createdAt.toISOString(),
    isImage: INLINE_IMAGE_TYPES.has(row.contentType),
  };
}

const SEVERITY_RANK: Record<RuleSeverity, number> = { CRITICAL: 0, MODERATE: 1, MINOR: 2 };

export function toScanDetail(row: ScanDetailRow): ScanDetailDto {
  const counts = countSeverities(row.violations);
  const status = row.status as ScanStatusKey;

  // The stored extraction is re-validated rather than trusted: it may have been
  // written by an older version of the schema.
  const extraction = labelExtractionSchema.safeParse(row.rawExtraction);

  return {
    id: row.id,
    productName: row.productName,
    status,
    complianceScore: row.complianceScore,
    band: bandFor(status, row.complianceScore, counts),
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    imageUrl: row.imageUrl,
    hasReport: Boolean(row.reportKey),
    failureReason: row.failureReason,
    violationCounts: counts,
    officer: { id: row.user.id, name: row.user.name },
    officerNote: row.officerNote,
    attemptCount: row.attemptCount,
    declarations: [...row.declarations]
      .map(toDeclaration)
      .sort((a, b) => DECLARATION_ORDER[a.key] - DECLARATION_ORDER[b.key]),
    violations: [...row.violations]
      .map(toViolation)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    relativeTextSizes: extraction.success ? extraction.data.relative_text_sizes : null,
    imageAssessment: extraction.success ? extraction.data.image_assessment : null,
    overallNotes: extraction.success ? extraction.data.overall_notes : null,
    // Already ordered oldest-first by the select, which is the order they were
    // gathered in and therefore the order an officer expects to review them.
    attachments: row.attachments.map(toAttachment),
    source: row.source as ScanSourceKey,
    sourceUrl: row.sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// Users (admin panel)
// ---------------------------------------------------------------------------

export const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  designation: true,
  jurisdiction: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { scans: true } },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export function toAdminUser(row: AdminUserRow): AdminUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    designation: row.designation,
    jurisdiction: row.jurisdiction,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    scanCount: row._count.scans,
  };
}
