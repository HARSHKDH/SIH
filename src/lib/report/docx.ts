import {
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import { EXTRACTION_PROVIDER_LABEL } from '@/lib/env';
import { DECLARATION_KEYS } from '@/lib/extraction/schema';
import { DECLARATION_LABEL, DECLARATION_RULE_REF } from '@/lib/labels';
import { bandPalette, severityPalette } from '@/lib/design/tokens';
import { complianceBand } from '@/lib/rules/engine';
import type { RuleSeverity } from '@/lib/rules/types';

import {
  METHODOLOGY_STEPS,
  REPORT_DEPARTMENT,
  REPORT_DISCLAIMER,
  REPORT_STATUTE,
  REPORT_TITLE,
  formatReportDateTime,
  notAssessedCount,
  reportReference,
  scoreFormulaText,
} from './shared';
import type { ReportData } from './template';

/**
 * The compliance report as an editable Word document.
 *
 * The Legal Metrology brief asks for reports "in PDF and editable formats", and the
 * reason is practical: the PDF is the immutable evidence copy, but an officer
 * escalating a finding needs to paste it into a notice, add case specifics and adjust
 * wording. A real OOXML `.docx` opens editable in Word, LibreOffice and Google Docs.
 *
 * Content deliberately mirrors the PDF section for section (A–F) so the two are
 * recognisably the same document, and the shared values in `./shared.ts` guarantee the
 * reference number, timestamps, score arithmetic and disclaimer are identical.
 *
 * Colours reuse the on-screen palette, minus the leading `#` that docx expects.
 */
const hex = (value: string) => value.replace('#', '');

// docx accepts a fixed set of raster formats; WebP is not among them.
const DOCX_IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

const BRAND = hex('#1E3A5F');
const INK = hex('#1A202C');
const INK_SECONDARY = hex('#4A5568');
const INK_MUTED = hex('#718096');
const LINE = hex('#E2E8F0');
const SURFACE_MUTED = hex('#FBFCFD');

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: LINE } as const;
const CELL_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
} as const;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND } },
    children: [new TextRun({ text, bold: true, size: 24, color: BRAND })],
  });
}

function body(text: string, options: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 90 },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italics,
        color: options.color ?? INK,
        size: options.size ?? 19,
      }),
    ],
  });
}

function cell(
  children: Paragraph[],
  options: { width?: number; shaded?: boolean; columnSpan?: number } = {},
): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    columnSpan: options.columnSpan,
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.shaded
      ? { type: ShadingType.CLEAR, color: 'auto', fill: SURFACE_MUTED }
      : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children,
  });
}

function textCell(
  text: string,
  options: { bold?: boolean; color?: string; width?: number; shaded?: boolean; size?: number } = {},
): TableCell {
  return cell(
    [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: options.bold,
            color: options.color ?? INK,
            size: options.size ?? 18,
          }),
        ],
      }),
    ],
    { width: options.width, shaded: options.shaded },
  );
}

function headerRow(labels: string[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: labels.map((label) =>
      textCell(label.toUpperCase(), { bold: true, color: INK_SECONDARY, shaded: true, size: 15 }),
    ),
  });
}

function fullWidthTable(rows: TableRow[]): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

const SEVERITY_LABEL: Record<RuleSeverity, string> = {
  CRITICAL: 'Critical',
  MODERATE: 'Moderate',
  MINOR: 'Minor',
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export async function renderReportDocx(data: ReportData): Promise<Buffer> {
  const { scan, officer, extraction, compliance, meta } = data;
  const band = complianceBand(compliance.breakdown);
  const bandStyle = bandPalette[band];
  const sizes = extraction.relative_text_sizes;
  const assessment = extraction.image_assessment;
  const reference = reportReference(scan.id);

  const children: (Paragraph | Table)[] = [];

  // ---- Masthead ----
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: REPORT_DEPARTMENT.toUpperCase(), bold: true, size: 15, color: INK_MUTED }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 60 },
      children: [new TextRun({ text: REPORT_TITLE, bold: true, size: 32, color: BRAND })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: REPORT_STATUTE, size: 17, color: INK_SECONDARY })],
    }),
    new Paragraph({
      spacing: { after: 260 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND } },
      children: [
        new TextRun({ text: `Reference ${reference}`, bold: true, size: 19, color: INK }),
        new TextRun({
          text: `    Generated ${formatReportDateTime(meta.generatedAt)}`,
          size: 17,
          color: INK_MUTED,
        }),
      ],
    }),
  );

  // ---- Verdict ----
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${compliance.score}/100  `, bold: true, size: 44, color: hex(bandStyle.fg) }),
        new TextRun({ text: bandStyle.label, bold: true, size: 26, color: hex(bandStyle.fg) }),
      ],
    }),
    fullWidthTable([
      headerRow(['Critical', 'Moderate', 'Minor', 'Clauses failed', 'Not assessed']),
      new TableRow({
        children: [
          textCell(String(compliance.breakdown.criticalCount), {
            bold: true,
            color: hex(severityPalette.CRITICAL.fg),
          }),
          textCell(String(compliance.breakdown.moderateCount), {
            bold: true,
            color: hex(severityPalette.MODERATE.fg),
          }),
          textCell(String(compliance.breakdown.minorCount), { bold: true, color: INK_MUTED }),
          textCell(
            `${compliance.breakdown.clausesFailed} of ${compliance.breakdown.clausesApplicable}`,
            { bold: true },
          ),
          textCell(String(notAssessedCount(compliance)), { bold: true }),
        ],
      }),
    ]),
  );

  // ---- Particulars ----
  children.push(heading('Particulars'));

  const particulars: Array<[string, string]> = [
    ['Scan reference', scan.id],
    ['Product as recorded', scan.productName ?? 'Not stated by the officer'],
    [
      'Inspecting officer',
      `${officer.name}${officer.designation ? ` · ${officer.designation}` : ''} (${officer.email})`,
    ],
    ['Jurisdiction', officer.jurisdiction ?? 'Not recorded'],
    ['Image captured', formatReportDateTime(scan.createdAt)],
    ['Assessment completed', formatReportDateTime(scan.processedAt)],
    [
      'Languages on label',
      assessment.detected_languages.length > 0
        ? assessment.detected_languages.join(', ')
        : 'Not determined',
    ],
    [
      'Extraction method',
      meta.regeneratedFromStoredExtraction
        ? 'Rebuilt from the extraction already on file; the vision model was not called again.'
        : meta.extractionSource === 'mock'
          ? 'Offline deterministic extractor (no vision API key configured)'
          : `${EXTRACTION_PROVIDER_LABEL[meta.extractionSource]} · ${meta.model}`,
    ],
  ];

  if (data.sourceLabel) particulars.splice(2, 0, ['Evidence source', data.sourceLabel]);

  children.push(
    fullWidthTable(
      particulars.map(
        ([label, value]) =>
          new TableRow({
            children: [
              textCell(label, { bold: true, color: INK_SECONDARY, shaded: true, width: 34 }),
              textCell(value, { width: 66 }),
            ],
          }),
      ),
    ),
  );

  // ---- Evidence photograph ----
  const imageType = data.imageContentType ? DOCX_IMAGE_TYPES[data.imageContentType] : undefined;
  if (data.imageBytes && imageType) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 60 },
        children: [
          new ImageRun({
            type: imageType,
            data: data.imageBytes,
            transformation: { width: 300, height: 375 },
            altText: {
              name: 'Label photograph',
              description: `Photograph of the package label assessed in ${reference}`,
              title: 'Label photograph',
            },
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: `Label as photographed · evidence for ${reference}`,
            size: 15,
            color: INK_MUTED,
            italics: true,
          }),
        ],
      }),
    );
  }

  // ---- A. Declarations ----
  children.push(heading('A. Mandatory declarations read from the label'));
  children.push(
    body(
      'Transcribed verbatim. A blank value means the declaration was not present on the panel photographed, not that it was illegible.',
      { color: INK_SECONDARY, size: 17 },
    ),
  );
  children.push(
    fullWidthTable([
      headerRow(['Declaration', 'Status', 'Value as printed', 'Conf.', 'Est. height']),
      ...DECLARATION_KEYS.map((key) => {
        const field = extraction[key];
        const value = field.value?.trim();
        const present = field.present && Boolean(value);

        return new TableRow({
          children: [
            cell(
              [
                new Paragraph({ children: [new TextRun({ text: DECLARATION_LABEL[key], bold: true, size: 18 })] }),
                new Paragraph({
                  children: [new TextRun({ text: DECLARATION_RULE_REF[key], size: 15, color: INK_MUTED })],
                }),
              ],
              { width: 24 },
            ),
            textCell(present ? 'Declared' : 'Not found', {
              bold: true,
              color: hex(present ? bandPalette.COMPLIANT.fg : severityPalette.CRITICAL.fg),
              width: 12,
            }),
            textCell(value ?? 'No such declaration was read on this label.', {
              width: 42,
              color: present ? INK : INK_MUTED,
            }),
            textCell(present ? `${Math.round(field.confidence * 100)}%` : '—', { width: 10 }),
            textCell(
              field.font_size_mm_est !== null ? `${field.font_size_mm_est.toFixed(1)} mm` : '—',
              { width: 12 },
            ),
          ],
        });
      }),
    ]),
  );

  // ---- B. Violations ----
  children.push(heading('B. Violations'));

  if (compliance.violations.length === 0) {
    children.push(
      body('No violations detected. Every applicable clause was satisfied by the declarations read from this label.', {
        color: hex(bandPalette.COMPLIANT.fg),
        bold: true,
      }),
    );
  } else {
    compliance.violations.forEach((violation, index) => {
      children.push(
        new Paragraph({
          spacing: { before: 180, after: 60 },
          children: [
            new TextRun({ text: `${index + 1}. `, bold: true, size: 19, color: INK }),
            new TextRun({ text: `${violation.ruleCode}  `, bold: true, size: 18, color: BRAND }),
            new TextRun({ text: violation.ruleTitle, bold: true, size: 19, color: INK }),
            new TextRun({
              text: `    [${SEVERITY_LABEL[violation.severity]}]`,
              bold: true,
              size: 17,
              color: hex(severityPalette[violation.severity].fg),
            }),
          ],
        }),
        body(violation.description, { size: 18 }),
      );

      if (violation.suggestedAction) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: 280 },
            border: { left: { style: BorderStyle.SINGLE, size: 10, color: BRAND } },
            children: [
              new TextRun({ text: 'Recommended action: ', bold: true, size: 17, color: INK_MUTED }),
              new TextRun({ text: violation.suggestedAction, size: 17, color: INK_SECONDARY }),
            ],
          }),
        );
      }
    });
  }

  // ---- C. Legibility ----
  children.push(heading('C. Legibility assessment'));
  children.push(
    fullWidthTable([
      headerRow(['Measure', 'Estimate']),
      new TableRow({
        children: [
          textCell('Principal display panel area', { width: 55 }),
          textCell(
            sizes.principal_display_panel_area_cm2_est !== null
              ? `${Math.round(sizes.principal_display_panel_area_cm2_est)} cm²`
              : 'Not estimated',
            { width: 45 },
          ),
        ],
      }),
      new TableRow({
        children: [
          textCell('Largest text height on panel'),
          textCell(
            sizes.largest_text_height_mm_est !== null
              ? `${sizes.largest_text_height_mm_est.toFixed(1)} mm`
              : 'Not estimated',
          ),
        ],
      }),
      new TableRow({
        children: [
          textCell('Smallest mandatory declaration'),
          textCell(
            sizes.smallest_declaration_text_height_mm_est !== null
              ? `${sizes.smallest_declaration_text_height_mm_est.toFixed(2)} mm`
              : 'Not estimated',
          ),
        ],
      }),
      new TableRow({
        children: [
          textCell('Smallest declaration legible to a consumer'),
          textCell(sizes.smallest_appears_illegible ? 'No' : 'Yes', {
            bold: true,
            color: hex(
              sizes.smallest_appears_illegible
                ? severityPalette.CRITICAL.fg
                : bandPalette.COMPLIANT.fg,
            ),
          }),
        ],
      }),
    ]),
  );
  if (sizes.notes) children.push(body(sizes.notes, { italics: true, color: INK_SECONDARY, size: 17 }));

  // ---- D. Clause-by-clause audit ----
  children.push(heading('D. Clause-by-clause audit'));
  children.push(
    body('Every clause applied, including those passed, so any figure above can be traced to the clause that produced it.', {
      color: INK_SECONDARY,
      size: 17,
    }),
  );
  children.push(
    fullWidthTable([
      headerRow(['Code', 'Clause', 'Weight', 'Result']),
      ...compliance.outcomes.map((outcome) => {
        const result = !outcome.applicable ? 'Not assessed' : outcome.passed ? 'Pass' : 'Fail';
        const colour = !outcome.applicable
          ? INK_MUTED
          : outcome.passed
            ? hex(bandPalette.COMPLIANT.fg)
            : hex(severityPalette.CRITICAL.fg);

        return new TableRow({
          children: [
            textCell(outcome.code, { bold: true, color: BRAND, width: 18 }),
            cell(
              [
                new Paragraph({ children: [new TextRun({ text: outcome.title, bold: true, size: 18 })] }),
                new Paragraph({
                  children: [new TextRun({ text: outcome.reference, size: 15, color: INK_MUTED })],
                }),
              ],
              { width: 60 },
            ),
            textCell(String(outcome.weight), { width: 10 }),
            textCell(result, { bold: true, color: colour, width: 12 }),
          ],
        });
      }),
    ]),
  );

  // ---- E. Officer's observations ----
  children.push(heading("E. Officer's observations"));
  children.push(
    scan.officerNote?.trim()
      ? body(scan.officerNote.trim())
      : body('No observation was recorded against this scan.', { italics: true, color: INK_MUTED }),
  );
  if (extraction.overall_notes) {
    children.push(
      body(`Extraction note: ${extraction.overall_notes}`, { italics: true, color: INK_SECONDARY, size: 17 }),
    );
  }

  // ---- Attachments ----
  if (data.attachments && data.attachments.length > 0) {
    children.push(heading('F. Supporting evidence'));
    children.push(
      fullWidthTable([
        headerRow(['#', 'Description', 'File', 'Attached']),
        ...data.attachments.map(
          (attachment, index) =>
            new TableRow({
              children: [
                textCell(String(index + 1), { width: 6 }),
                textCell(attachment.caption ?? 'No description given', { width: 46 }),
                textCell(attachment.fileName, { width: 26, color: INK_SECONDARY }),
                textCell(formatReportDateTime(attachment.createdAt), { width: 22 }),
              ],
            }),
        ),
      ]),
    );
  }

  // ---- Methodology ----
  const methodologyLetter = data.attachments && data.attachments.length > 0 ? 'G' : 'F';
  children.push(heading(`${methodologyLetter}. How this assessment was produced`));
  METHODOLOGY_STEPS.forEach((step, index) => {
    children.push(body(`${index + 1}. ${step}`, { size: 17, color: INK_SECONDARY }));
  });
  children.push(
    body(`Score: ${scoreFormulaText(compliance)}`, { bold: true, size: 17 }),
  );

  // ---- Signatures ----
  children.push(
    new Paragraph({ spacing: { before: 460 }, children: [] }),
    fullWidthTable([
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({ spacing: { before: 340 }, children: [] }),
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 6, color: INK_MUTED } },
                children: [
                  new TextRun({
                    text: `Signature of Inspecting Officer — ${officer.name}`,
                    size: 16,
                    color: INK_MUTED,
                  }),
                ],
              }),
            ],
            { width: 50 },
          ),
          cell(
            [
              new Paragraph({ spacing: { before: 340 }, children: [] }),
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 6, color: INK_MUTED } },
                children: [
                  new TextRun({
                    text: 'Countersigned (Controller / Assistant Controller)',
                    size: 16,
                    color: INK_MUTED,
                  }),
                ],
              }),
            ],
            { width: 50 },
          ),
        ],
      }),
    ]),
  );

  // ---- Disclaimer ----
  children.push(
    new Paragraph({
      spacing: { before: 320 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
      children: [new TextRun({ text: REPORT_DISCLAIMER, size: 15, color: INK_MUTED })],
    }),
  );

  const document = new Document({
    title: `Compliance Report ${reference}`,
    subject: REPORT_TITLE,
    creator: `${officer.name} · Legal Metrology Compliance Checker`,
    description: `Legal Metrology compliance assessment for ${scan.productName ?? 'an unnamed product'}`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 19, color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

/** Filename an officer sees when the editable report downloads. */
export function docxFileName(scanId: string): string {
  return `compliance-report-${scanId.slice(-10)}.docx`;
}

export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

