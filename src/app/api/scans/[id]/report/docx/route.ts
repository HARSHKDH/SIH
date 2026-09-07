import { withRoute } from '@/lib/api/errors';
import { assertCanAccessScan } from '@/lib/api/scan-access';
import { requireUser } from '@/lib/auth/server';
import {
  DOCX_CONTENT_TYPE,
  buildReportDataForScan,
  docxFileName,
  renderReportDocx,
} from '@/lib/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/scans/:id/report/docx — the editable compliance report.
 *
 * The Rules brief asks for reports "in PDF and editable formats". The PDF is the
 * immutable evidence copy; this is the working copy an officer edits into a notice,
 * adding case specifics before it goes out under signature.
 *
 * Generated on demand rather than stored: unlike the PDF there is no need to pin a
 * byte-identical artefact, and building it fresh means it always reflects the current
 * officer note and attachment list.
 */
export const GET = withRoute(async (_request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();

  const { data, ownerId } = await buildReportDataForScan(params.id);
  assertCanAccessScan(user, ownerId);

  const docx = await renderReportDocx(data);
  const filename = docxFileName(params.id);

  return new Response(new Uint8Array(docx), {
    status: 200,
    headers: {
      'Content-Type': DOCX_CONTENT_TYPE,
      'Content-Length': String(docx.length),
      // Always an attachment — a browser cannot usefully render OOXML inline.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
