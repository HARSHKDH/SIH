import { buildReportKey, storage } from '@/lib/storage';

import { buildImageDataUri, ruleBookSummary } from './assets';
import { ReportRenderError, renderHtmlToPdf } from './pdf';
import { renderReportHtml, reportFooterTemplate, type ReportData } from './template';

export interface GeneratedReport {
  key: string;
  url: string;
  byteLength: number;
}

/**
 * Renders the compliance report to PDF and stores it.
 *
 * Returns the storage key and URL for the caller to persist on the Scan row.
 * A report failure is deliberately *not* fatal to the scan: the worker records
 * the assessment first and treats a missing PDF as a regenerable artefact.
 */
export async function generateComplianceReport(data: ReportData): Promise<GeneratedReport> {
  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf({
      html: renderReportHtml(data),
      footerTemplate: reportFooterTemplate(data.scan.id),
    });
  } catch (error) {
    throw new ReportRenderError(
      `Failed to render the PDF report for scan ${data.scan.id}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
      error,
    );
  }

  const key = buildReportKey(data.scan.id);
  const stored = await storage.putObject({ key, body: pdf, contentType: 'application/pdf' });

  return { key: stored.key, url: stored.url, byteLength: pdf.length };
}

export { buildImageDataUri, MAX_EMBEDDED_IMAGE_BYTES, ruleBookSummary } from './assets';
export { buildReportDataForScan } from './build';
export { DOCX_CONTENT_TYPE, docxFileName, renderReportDocx } from './docx';
export { closeBrowser, getBrowser, ReportRenderError } from './pdf';
export { describeScanSource, reportReference, shortRef } from './shared';
export { renderReportHtml, reportFooterTemplate } from './template';
export type {
  ReportAttachment,
  ReportData,
  ReportMeta,
  ReportOfficer,
  ReportScan,
} from './template';
