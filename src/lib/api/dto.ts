// Type-only import, so this is erased at compile time and never pulls the
// environment module into a client bundle.
import type { ExtractionProvider } from '@/lib/env';
import type {
  BoundingBox,
  DeclarationKey,
  ImageAssessment,
  RelativeTextSizes,
} from '@/lib/extraction/schema';
import type { AttachmentKindKey, ScanSourceKey, ScanStatusKey } from '@/lib/labels';
import type { ComplianceBand } from '@/lib/rules/engine';
import type { RuleSeverity } from '@/lib/rules/types';

/**
 * The wire contract between the API routes and the React client.
 *
 * Client components import these types only — never `@prisma/client` — so the
 * Prisma runtime never ends up in a browser bundle, and Date objects are always
 * ISO strings by the time they reach the UI.
 */

export interface SessionUserDto {
  id: string;
  name: string;
  email: string;
  role: 'OFFICER' | 'ADMIN';
}

export interface ViolationCountsDto {
  critical: number;
  moderate: number;
  minor: number;
  total: number;
}

export interface ScanSummaryDto {
  id: string;
  productName: string | null;
  status: ScanStatusKey;
  complianceScore: number | null;
  band: ComplianceBand | null;
  createdAt: string;
  processedAt: string | null;
  imageUrl: string;
  hasReport: boolean;
  failureReason: string | null;
  violationCounts: ViolationCountsDto;
  officer: { id: string; name: string } | null;
}

export interface DeclarationDto {
  id: string;
  key: DeclarationKey;
  label: string;
  ruleRef: string;
  valueFound: string | null;
  confidence: number;
  boundingBox: BoundingBox | null;
  fontSizeEst: number | null;
}

export interface ViolationDto {
  id: string;
  ruleCode: string;
  ruleTitle: string;
  description: string;
  severity: RuleSeverity;
  suggestedAction: string | null;
}

/** One piece of supporting evidence an officer attached to a scan. */
export interface AttachmentDto {
  id: string;
  kind: AttachmentKindKey;
  fileName: string;
  /** Authenticated URL to view or download it. */
  fileUrl: string;
  contentType: string;
  byteSize: number;
  caption: string | null;
  createdAt: string;
  /** True when the browser can render it inline as a thumbnail. */
  isImage: boolean;
}

export interface ScanDetailDto extends ScanSummaryDto {
  officerNote: string | null;
  attemptCount: number;
  declarations: DeclarationDto[];
  violations: ViolationDto[];
  relativeTextSizes: RelativeTextSizes | null;
  imageAssessment: ImageAssessment | null;
  overallNotes: string | null;
  attachments: AttachmentDto[];
  /** Whether the scan came from an uploaded photograph or an e-commerce listing. */
  source: ScanSourceKey;
  sourceUrl: string | null;
}

export interface PaginationDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ScanListDto {
  scans: ScanSummaryDto[];
  pagination: PaginationDto;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardStatsDto {
  totalScans: number;
  pending: number;
  failed: number;
  violationsThisWeek: number;
  /** Percentage of completed scans with no critical or moderate violations. */
  complianceRate: number;
  /** Mean compliance score across completed scans, or null when there are none. */
  averageScore: number | null;
  completedScans: number;
  scansThisWeek: number;
  /** Seven-day trend, oldest first. */
  trend: Array<{ date: string; scans: number; violations: number }>;
  topViolations: Array<{ ruleCode: string; ruleTitle: string; count: number }>;
}

export interface DashboardDto {
  stats: DashboardStatsDto;
  recentScans: ScanSummaryDto[];
  system: SystemStatusDto;
}

export interface SystemStatusDto {
  storageDriver: 'local' | 's3';
  storageFallback: boolean;
  /** Which vision provider is live: 'gemini', 'claude', or 'mock' for the fallback. */
  extractionMode: ExtractionProvider;
  /** Human label for the provider, e.g. "Google Gemini". */
  extractionProviderLabel: string;
  extractionModel: string;
  queue: { reachable: boolean; waiting: number; active: number; failed: number } | null;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadTargetDto {
  driver: 'local' | 's3';
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  publicUrl: string;
  expiresInSeconds: number;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: 'OFFICER' | 'ADMIN';
  isActive: boolean;
  designation: string | null;
  jurisdiction: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  scanCount: number;
}

export interface RuleStatDto {
  ruleCode: string;
  ruleTitle: string;
  reference: string;
  count: number;
  /** Share of all violations, 0-100. */
  share: number;
  severityBreakdown: ViolationCountsDto;
}

export interface AdminStatsDto {
  totals: {
    users: number;
    activeUsers: number;
    scans: number;
    completedScans: number;
    failedScans: number;
    violations: number;
  };
  severityBreakdown: ViolationCountsDto;
  ruleStats: RuleStatDto[];
  scoreDistribution: Array<{ band: string; label: string; count: number }>;
  officerActivity: Array<{
    id: string;
    name: string;
    scans: number;
    averageScore: number | null;
    violations: number;
  }>;
  system: SystemStatusDto;
}
