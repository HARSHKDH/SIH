import { bandPalette, fontStack, palette, severityPalette } from '@/lib/design/tokens';
import { EXTRACTION_PROVIDER_LABEL, type ExtractionProvider } from '@/lib/env';

import { REPORT_DISCLAIMER, formatReportDateTime, shortRef } from './shared';
import { DECLARATION_KEYS, type LabelExtraction } from '@/lib/extraction/schema';
import { DECLARATION_LABEL, DECLARATION_RULE_REF } from '@/lib/labels';
import { complianceBand } from '@/lib/rules/engine';
import type { ClauseOutcome, ComplianceResult } from '@/lib/rules/types';

export interface ReportScan {
  id: string;
  productName: string | null;
  createdAt: Date;
  processedAt: Date | null;
  officerNote: string | null;
}

export interface ReportOfficer {
  name: string;
  email: string;
  role: string;
  designation: string | null;
  jurisdiction: string | null;
}

export interface ReportMeta {
  generatedAt: Date;
  /** Which provider transcribed the label. Named on the report for traceability. */
  extractionSource: ExtractionProvider;
  model: string;
  /** e.g. "12 clauses, 110 total weight" — printed in the methodology note. */
  ruleBookSummary: string;
  /**
   * True when the PDF was rebuilt from the extraction already on file rather than
   * rendered during the original pipeline run. Stated on the report so a reader
   * knows the vision model was not called again.
   */
  regeneratedFromStoredExtraction?: boolean;
}

/** One piece of supporting evidence an officer attached to the scan. */
export interface ReportAttachment {
  fileName: string;
  caption: string | null;
  createdAt: Date;
}

export interface ReportData {
  scan: ReportScan;
  officer: ReportOfficer;
  extraction: LabelExtraction;
  compliance: ComplianceResult;
  /** Label photograph as a data URI, embedded so the PDF is self-contained. */
  imageDataUri: string | null;
  /**
   * Raw label photograph. The DOCX renderer embeds bytes directly rather than a data
   * URI, so both are provided and each renderer takes the form it needs.
   */
  imageBytes?: Buffer | null;
  imageContentType?: string | null;
  /** Supporting evidence listed in both reports. */
  attachments?: ReportAttachment[];
  /** e.g. "Photograph uploaded by officer" or an e-commerce listing URL. */
  sourceLabel?: string | null;
  meta: ReportMeta;
}

// ---------------------------------------------------------------------------
// Escaping — extraction values are untrusted text read off a photograph
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Every interpolated value passes through here. The label text comes from a
 * vision model reading arbitrary packaging, so treating it as trusted markup
 * would be an injection hole straight into the generated report.
 */
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Shared with the DOCX renderer so both reports agree. See `./shared.ts`. */
const dt = formatReportDateTime;

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

function severityPill(severity: 'CRITICAL' | 'MODERATE' | 'MINOR'): string {
  const c = severityPalette[severity];
  return `<span class="pill" style="color:${c.fg};background:${c.bg};border-color:${c.border}">${esc(c.label)}</span>`;
}

function presencePill(present: boolean): string {
  const c = present
    ? { fg: palette.compliant, bg: palette.compliantSoft, border: palette.compliantBorder, label: 'Declared' }
    : { fg: palette.critical, bg: palette.criticalSoft, border: palette.criticalBorder, label: 'Not found' };
  return `<span class="pill" style="color:${c.fg};background:${c.bg};border-color:${c.border}">${c.label}</span>`;
}

function clauseStatusPill(outcome: ClauseOutcome): string {
  if (!outcome.applicable) {
    return `<span class="pill" style="color:${palette.neutral};background:${palette.neutralSoft};border-color:${palette.neutralBorder}">Not assessed</span>`;
  }
  if (outcome.passed) {
    return `<span class="pill" style="color:${palette.compliant};background:${palette.compliantSoft};border-color:${palette.compliantBorder}">Pass</span>`;
  }
  return `<span class="pill" style="color:${palette.critical};background:${palette.criticalSoft};border-color:${palette.criticalBorder}">Fail</span>`;
}

function declarationRows(extraction: LabelExtraction): string {
  return DECLARATION_KEYS.map((key) => {
    const field = extraction[key];
    const value = field.value?.trim();
    return `
      <tr>
        <td>
          <div class="cell-title">${esc(DECLARATION_LABEL[key])}</div>
          <div class="cell-sub">${esc(DECLARATION_RULE_REF[key])}</div>
        </td>
        <td>${presencePill(field.present && !!value)}</td>
        <td class="value-cell">${
          value
            ? `<span class="value-text">${esc(value)}</span>${
                field.notes ? `<div class="cell-note">${esc(field.notes)}</div>` : ''
              }`
            : '<span class="muted">No such declaration was read on this label.</span>'
        }</td>
        <td class="num">${field.present ? esc(pct(field.confidence)) : '—'}</td>
        <td class="num">${
          field.font_size_mm_est !== null ? `${esc(field.font_size_mm_est.toFixed(1))} mm` : '—'
        }</td>
      </tr>`;
  }).join('');
}

function violationBlocks(compliance: ComplianceResult): string {
  if (compliance.violations.length === 0) {
    return `<div class="callout callout-ok">
        <strong>No violations detected.</strong>
        Every applicable clause in the rule book was satisfied by the declarations read from this label.
      </div>`;
  }

  return compliance.violations
    .map(
      (v, index) => `
      <div class="violation">
        <div class="violation-head">
          <span class="violation-index">${index + 1}</span>
          <span class="violation-code">${esc(v.ruleCode)}</span>
          <span class="violation-title">${esc(v.ruleTitle)}</span>
          ${severityPill(v.severity)}
        </div>
        <p class="violation-body">${esc(v.description)}</p>
        <div class="violation-action">
          <span class="violation-action-label">Recommended action</span>
          <span>${esc(v.suggestedAction)}</span>
        </div>
      </div>`,
    )
    .join('');
}

function clauseAuditRows(compliance: ComplianceResult): string {
  return compliance.outcomes
    .map(
      (o) => `
      <tr>
        <td class="mono">${esc(o.code)}</td>
        <td>
          <div class="cell-title">${esc(o.title)}</div>
          <div class="cell-sub">${esc(o.reference)}</div>
        </td>
        <td class="num">${o.weight}</td>
        <td>${clauseStatusPill(o)}</td>
      </tr>`,
    )
    .join('');
}

/**
 * Supporting evidence, listed rather than reproduced.
 *
 * The report is a document about the assessment, not a bundle of the exhibits: a
 * multi-page scanned invoice embedded here would bury the findings. The files stay in
 * the repository against the same scan reference, and this table is the index to them.
 * Filenames and captions come from the officer's own machine and keyboard, so both go
 * through `esc` like every other untrusted value in this template.
 */
function attachmentRows(attachments: readonly ReportAttachment[]): string {
  return attachments
    .map(
      (attachment, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${
          attachment.caption
            ? esc(attachment.caption)
            : '<span class="muted">No description given</span>'
        }</td>
        <td class="mono">${esc(attachment.fileName)}</td>
        <td>${esc(dt(attachment.createdAt))}</td>
      </tr>`,
    )
    .join('');
}

function scoreRing(score: number, color: string): string {
  // A conic-gradient ring renders reliably in headless Chrome and needs no SVG.
  const degrees = Math.round((score / 100) * 360);
  return `
    <div class="ring" style="background:conic-gradient(${color} 0deg ${degrees}deg, ${palette.line} ${degrees}deg 360deg)">
      <div class="ring-inner">
        <div class="ring-score" style="color:${color}">${score}</div>
        <div class="ring-unit">/ 100</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function renderReportHtml(data: ReportData): string {
  const { scan, officer, extraction, compliance, imageDataUri, meta } = data;
  const band = complianceBand(compliance.breakdown);
  const bandStyle = bandPalette[band];
  const sizes = extraction.relative_text_sizes;
  const assessment = extraction.image_assessment;

  // Supporting evidence only earns a section when there is some, so the methodology
  // keeps the letter it would otherwise have had. Both renderers apply the same rule —
  // see `methodologyLetter` in ./docx.ts — so the two documents number alike.
  const attachments = data.attachments ?? [];
  const hasAttachments = attachments.length > 0;
  const methodologyLetter = hasAttachments ? 'G' : 'F';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Compliance Report ${esc(shortRef(scan.id))}</title>
<style>
  /* Design system mirrors the on-screen application exactly: deep slate blue
     brand, warm off-white surfaces, muted semantic colours. */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${fontStack};
    font-size: 9.5pt;
    line-height: 1.5;
    color: ${palette.ink};
    background: ${palette.surface};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1, h2, h3 { margin: 0; font-weight: 600; }

  .masthead {
    background: ${palette.brand};
    color: ${palette.inkInverse};
    padding: 18px 22px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .masthead-dept {
    font-size: 8pt;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    opacity: 0.82;
    margin-bottom: 4px;
  }
  .masthead-title { font-size: 15pt; letter-spacing: -0.01em; }
  .masthead-sub { font-size: 8.5pt; opacity: 0.82; margin-top: 3px; }
  .masthead-ref { text-align: right; font-size: 8.5pt; opacity: 0.9; }
  .masthead-ref .ref-no {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 11pt;
    letter-spacing: 0.04em;
    display: block;
    margin-bottom: 2px;
  }

  .sheet { padding: 20px 22px 8px; }

  section { margin-bottom: 18px; }
  section.break-before { page-break-before: always; }

  .section-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1.5px solid ${palette.brand};
    padding-bottom: 5px;
    margin-bottom: 10px;
  }
  .section-head h2 { font-size: 11pt; color: ${palette.brand}; }
  .section-head .section-note { font-size: 8pt; color: ${palette.inkMuted}; margin-left: auto; }

  /* --- verdict strip --- */
  .verdict {
    display: flex;
    gap: 18px;
    align-items: center;
    border: 1px solid ${palette.line};
    border-left: 4px solid ${bandStyle.fg};
    border-radius: 6px;
    background: ${palette.canvas};
    padding: 14px 18px;
  }
  .ring {
    width: 82px; height: 82px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .ring-inner {
    width: 64px; height: 64px; border-radius: 50%;
    background: ${palette.surface};
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .ring-score { font-size: 19pt; font-weight: 600; line-height: 1; }
  .ring-unit { font-size: 7pt; color: ${palette.inkMuted}; margin-top: 1px; }

  .verdict-main { flex: 1; }
  .verdict-band {
    font-size: 13pt; font-weight: 600; color: ${bandStyle.fg}; margin-bottom: 3px;
  }
  .verdict-line { font-size: 8.5pt; color: ${palette.inkSecondary}; }

  .tallies { display: flex; gap: 8px; }
  .tally {
    border: 1px solid ${palette.line};
    background: ${palette.surface};
    border-radius: 5px;
    padding: 7px 12px;
    text-align: center;
    min-width: 68px;
  }
  .tally-n { font-size: 14pt; font-weight: 600; line-height: 1.1; }
  .tally-l {
    font-size: 6.8pt; text-transform: uppercase; letter-spacing: 0.06em;
    color: ${palette.inkMuted}; margin-top: 2px;
  }

  /* --- particulars + photo --- */
  .evidence { display: flex; gap: 16px; align-items: flex-start; }
  .photo-frame {
    width: 232px; flex-shrink: 0;
    border: 1px solid ${palette.line}; border-radius: 6px;
    background: ${palette.canvas}; padding: 7px;
  }
  .photo-frame img { width: 100%; display: block; border-radius: 3px; }
  .photo-caption {
    font-size: 7.2pt; color: ${palette.inkMuted}; text-align: center;
    margin-top: 5px; letter-spacing: 0.02em;
  }
  .photo-missing {
    height: 150px; display: flex; align-items: center; justify-content: center;
    font-size: 8pt; color: ${palette.inkMuted}; text-align: center; padding: 0 12px;
  }

  .particulars { flex: 1; border: 1px solid ${palette.line}; border-radius: 6px; overflow: hidden; }
  .particulars table { width: 100%; border-collapse: collapse; }
  .particulars th, .particulars td {
    text-align: left; padding: 6px 11px; font-size: 8.6pt;
    border-bottom: 1px solid ${palette.line}; vertical-align: top;
  }
  .particulars tr:last-child th, .particulars tr:last-child td { border-bottom: none; }
  .particulars th {
    width: 38%; font-weight: 500; color: ${palette.inkSecondary};
    background: ${palette.surfaceMuted};
  }

  /* --- data tables --- */
  table.data { width: 100%; border-collapse: collapse; }
  table.data thead th {
    text-align: left; font-size: 7.2pt; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: ${palette.inkSecondary}; background: ${palette.surfaceMuted};
    padding: 7px 9px; border-top: 1px solid ${palette.line};
    border-bottom: 1px solid ${palette.lineStrong};
  }
  table.data tbody td {
    padding: 7px 9px; font-size: 8.6pt; vertical-align: top;
    border-bottom: 1px solid ${palette.line};
  }
  table.data tbody tr { page-break-inside: avoid; }
  .cell-title { font-weight: 500; }
  .cell-sub { font-size: 7.2pt; color: ${palette.inkMuted}; margin-top: 1px; }
  .cell-note {
    font-size: 7.4pt; color: ${palette.inkMuted}; margin-top: 3px; font-style: italic;
  }
  .value-cell { width: 40%; }
  .value-text { color: ${palette.ink}; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 8pt; white-space: nowrap; }
  .muted { color: ${palette.inkMuted}; }

  .pill {
    display: inline-block; border: 1px solid; border-radius: 999px;
    padding: 1px 8px; font-size: 7.2pt; font-weight: 600;
    letter-spacing: 0.03em; white-space: nowrap;
  }

  /* --- violations --- */
  .violation {
    border: 1px solid ${palette.line}; border-radius: 6px;
    padding: 10px 12px; margin-bottom: 9px;
    page-break-inside: avoid;
  }
  .violation-head {
    display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
  }
  .violation-index {
    width: 17px; height: 17px; border-radius: 50%;
    background: ${palette.brand}; color: ${palette.inkInverse};
    font-size: 7.4pt; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .violation-code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 8pt; color: ${palette.brand}; font-weight: 600;
  }
  .violation-title { font-size: 9pt; font-weight: 600; flex: 1; }
  .violation-body { margin: 0 0 7px; font-size: 8.6pt; color: ${palette.ink}; }
  .violation-action {
    background: ${palette.canvas}; border-left: 2px solid ${palette.brandHover};
    padding: 6px 9px; font-size: 8.2pt; color: ${palette.inkSecondary};
  }
  .violation-action-label {
    display: block; font-size: 6.8pt; text-transform: uppercase;
    letter-spacing: 0.07em; color: ${palette.inkMuted}; margin-bottom: 2px;
  }

  .callout {
    border: 1px solid ${palette.line}; border-left: 3px solid ${palette.neutral};
    border-radius: 5px; padding: 9px 12px; font-size: 8.6pt;
    color: ${palette.inkSecondary}; background: ${palette.canvas};
  }
  .callout-ok { border-left-color: ${palette.compliant}; background: ${palette.compliantSoft}; }
  .callout-warn { border-left-color: ${palette.moderate}; background: ${palette.moderateSoft}; }
  .callout strong { color: ${palette.ink}; }

  .note-box {
    border: 1px solid ${palette.line}; border-radius: 6px;
    padding: 10px 12px; font-size: 8.8pt; background: ${palette.surfaceMuted};
    white-space: pre-wrap;
  }

  .methodology { font-size: 7.8pt; color: ${palette.inkSecondary}; }
  .methodology p { margin: 0 0 5px; }
  .methodology ol { margin: 0 0 5px; padding-left: 16px; }
  .methodology li { margin-bottom: 2px; }

  .signature { display: flex; gap: 28px; margin-top: 22px; page-break-inside: avoid; }
  .signature-block { flex: 1; }
  .signature-rule {
    border-bottom: 1px solid ${palette.lineStrong}; height: 34px; margin-bottom: 4px;
  }
  .signature-label { font-size: 7.6pt; color: ${palette.inkMuted}; }

  .disclaimer {
    margin-top: 16px; border-top: 1px solid ${palette.line};
    padding-top: 8px; font-size: 7.2pt; color: ${palette.inkMuted};
  }
</style>
</head>
<body>

<div class="masthead">
  <div>
    <div class="masthead-dept">Government of India &middot; Department of Legal Metrology</div>
    <h1 class="masthead-title">Packaged Commodities Compliance Report</h1>
    <div class="masthead-sub">
      Legal Metrology Act, 2009 &middot; Legal Metrology (Packaged Commodities) Rules, 2011
    </div>
  </div>
  <div class="masthead-ref">
    <span class="ref-no">LM/${esc(shortRef(scan.id))}</span>
    Generated ${esc(dt(meta.generatedAt))}
  </div>
</div>

<div class="sheet">

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="verdict">
      ${scoreRing(compliance.score, bandStyle.fg)}
      <div class="verdict-main">
        <div class="verdict-band">${esc(bandStyle.label)}</div>
        <div class="verdict-line">
          ${compliance.breakdown.clausesFailed} of ${compliance.breakdown.clausesApplicable}
          applicable clauses failed.
          ${compliance.breakdown.clausesEvaluated - compliance.breakdown.clausesApplicable} clause(s)
          could not be assessed from this photograph and were excluded from the score.
        </div>
      </div>
      <div class="tallies">
        <div class="tally">
          <div class="tally-n" style="color:${palette.critical}">${compliance.breakdown.criticalCount}</div>
          <div class="tally-l">Critical</div>
        </div>
        <div class="tally">
          <div class="tally-n" style="color:${palette.moderate}">${compliance.breakdown.moderateCount}</div>
          <div class="tally-l">Moderate</div>
        </div>
        <div class="tally">
          <div class="tally-n" style="color:${palette.neutral}">${compliance.breakdown.minorCount}</div>
          <div class="tally-l">Minor</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head"><h2>Particulars</h2></div>
    <div class="evidence">
      <div class="photo-frame">
        ${
          imageDataUri
            ? `<img src="${esc(imageDataUri)}" alt="Photograph of the package label under assessment" />`
            : '<div class="photo-missing">Label photograph could not be embedded in this report.</div>'
        }
        <div class="photo-caption">Label as photographed &middot; evidence for ref. LM/${esc(shortRef(scan.id))}</div>
      </div>
      <div class="particulars">
        <table>
          <tbody>
            <tr><th>Scan reference</th><td class="mono">${esc(scan.id)}</td></tr>
            <tr><th>Product as recorded</th><td>${
              scan.productName ? esc(scan.productName) : '<span class="muted">Not stated by the officer</span>'
            }</td></tr>
            <tr><th>Inspecting officer</th><td>${esc(officer.name)}${
              officer.designation ? ` &middot; ${esc(officer.designation)}` : ''
            }<div class="cell-sub">${esc(officer.email)} &middot; ${esc(officer.role)}</div></td></tr>
            <tr><th>Jurisdiction</th><td>${
              officer.jurisdiction ? esc(officer.jurisdiction) : '<span class="muted">Not recorded</span>'
            }</td></tr>
            <tr><th>Material assessed</th><td>${
              data.sourceLabel
                ? esc(data.sourceLabel)
                : '<span class="muted">Not recorded</span>'
            }</td></tr>
            <tr><th>Image captured</th><td>${esc(dt(scan.createdAt))}</td></tr>
            <tr><th>Assessment completed</th><td>${esc(dt(scan.processedAt))}</td></tr>
            <tr><th>Languages on label</th><td>${
              assessment.detected_languages.length > 0
                ? esc(assessment.detected_languages.join(', '))
                : '<span class="muted">Not determined</span>'
            }</td></tr>
            <tr><th>Extraction method</th><td>${
              meta.regeneratedFromStoredExtraction
                ? 'Rebuilt from the extraction already on file; the vision model was not called again.'
                : meta.extractionSource === 'mock'
                  ? 'Offline deterministic extractor (no vision API key configured)'
                  : `${esc(EXTRACTION_PROVIDER_LABEL[meta.extractionSource])} &middot; <span class="mono">${esc(meta.model)}</span>`
            }</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head">
      <h2>A. Mandatory declarations read from the label</h2>
      <span class="section-note">Transcribed verbatim; blank entries indicate absence, not illegibility</span>
    </div>
    <table class="data">
      <thead>
        <tr>
          <th>Declaration</th>
          <th>Status</th>
          <th>Value as printed</th>
          <th class="num">Conf.</th>
          <th class="num">Est. height</th>
        </tr>
      </thead>
      <tbody>${declarationRows(extraction)}</tbody>
    </table>
    ${
      assessment.issues.length > 0
        ? `<div class="callout callout-warn" style="margin-top:9px">
             <strong>Image conditions noted:</strong> ${esc(assessment.issues.join('; '))}.
           </div>`
        : ''
    }
  </section>

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head">
      <h2>B. Violations</h2>
      <span class="section-note">${compliance.violations.length} finding(s), most serious first</span>
    </div>
    ${violationBlocks(compliance)}
  </section>

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head">
      <h2>C. Legibility assessment</h2>
      <span class="section-note">Rule 9 and the Third Schedule</span>
    </div>
    <table class="data">
      <thead>
        <tr><th>Measure</th><th>Estimate</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="cell-title">Principal display panel area</td>
          <td>${
            sizes.principal_display_panel_area_cm2_est !== null
              ? `${esc(Math.round(sizes.principal_display_panel_area_cm2_est))} cm&sup2;`
              : '<span class="muted">Not estimated</span>'
          }</td>
        </tr>
        <tr>
          <td class="cell-title">Largest text height on panel</td>
          <td>${
            sizes.largest_text_height_mm_est !== null
              ? `${esc(sizes.largest_text_height_mm_est.toFixed(1))} mm`
              : '<span class="muted">Not estimated</span>'
          }</td>
        </tr>
        <tr>
          <td class="cell-title">Smallest mandatory declaration</td>
          <td>${
            sizes.smallest_declaration_text_height_mm_est !== null
              ? `${esc(sizes.smallest_declaration_text_height_mm_est.toFixed(2))} mm`
              : '<span class="muted">Not estimated</span>'
          }</td>
        </tr>
        <tr>
          <td class="cell-title">Smallest declaration legible to a consumer</td>
          <td>${
            sizes.smallest_appears_illegible
              ? `<span class="pill" style="color:${palette.critical};background:${palette.criticalSoft};border-color:${palette.criticalBorder}">No</span>`
              : `<span class="pill" style="color:${palette.compliant};background:${palette.compliantSoft};border-color:${palette.compliantBorder}">Yes</span>`
          }</td>
        </tr>
      </tbody>
    </table>
    ${sizes.notes ? `<div class="callout" style="margin-top:9px">${esc(sizes.notes)}</div>` : ''}
  </section>

  <!-- ------------------------------------------------------------------ -->
  <section class="break-before">
    <div class="section-head">
      <h2>D. Clause-by-clause audit</h2>
      <span class="section-note">Every clause applied, including those passed</span>
    </div>
    <table class="data">
      <thead>
        <tr><th>Code</th><th>Clause</th><th class="num">Weight</th><th>Result</th></tr>
      </thead>
      <tbody>${clauseAuditRows(compliance)}</tbody>
    </table>
  </section>

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head"><h2>E. Officer's observations</h2></div>
    ${
      scan.officerNote && scan.officerNote.trim()
        ? `<div class="note-box">${esc(scan.officerNote.trim())}</div>`
        : '<div class="callout">No observation was recorded against this scan.</div>'
    }
    ${
      extraction.overall_notes
        ? `<div class="callout" style="margin-top:9px">
             <strong>Extraction note:</strong> ${esc(extraction.overall_notes)}
           </div>`
        : ''
    }
  </section>

  ${
    hasAttachments
      ? `<!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head">
      <h2>F. Supporting evidence</h2>
      <span class="section-note">${attachments.length} item(s) held on the inspection record</span>
    </div>
    <table class="data">
      <thead>
        <tr><th class="num">#</th><th>Description</th><th>File</th><th>Attached</th></tr>
      </thead>
      <tbody>${attachmentRows(attachments)}</tbody>
    </table>
    <div class="callout" style="margin-top:9px">
      The files themselves are held against scan ref. LM/${esc(shortRef(scan.id))} in the
      inspection repository and are not reproduced in this document.
    </div>
  </section>`
      : ''
  }

  <!-- ------------------------------------------------------------------ -->
  <section>
    <div class="section-head"><h2>${methodologyLetter}. How this assessment was produced</h2></div>
    <div class="methodology">
      <ol>
        <li>The label photograph was transcribed into a fixed set of declaration fields. The extractor is instructed to report absence rather than infer a plausible value, so a blank field means nothing was read at that position.</li>
        <li>Each declaration was then tested by an independent, deterministic rule function &mdash; ${esc(meta.ruleBookSummary)}. No part of the compliance decision is made by the vision model.</li>
        <li>The score is a weighted deduction over the clauses that could actually be assessed:
          <span class="mono">100 &times; (${compliance.breakdown.applicableWeight} &minus; ${compliance.breakdown.lostWeight}) / ${compliance.breakdown.applicableWeight} = ${compliance.score}</span>.
          Clauses that could not be assessed are excluded from the denominator rather than counted as passes.</li>
      </ol>
      <p>Section D above lists every clause and its outcome so that any figure in this report can be traced to the clause that produced it.</p>
    </div>

    <div class="signature">
      <div class="signature-block">
        <div class="signature-rule"></div>
        <div class="signature-label">Signature of Inspecting Officer &mdash; ${esc(officer.name)}</div>
      </div>
      <div class="signature-block">
        <div class="signature-rule"></div>
        <div class="signature-label">Countersigned (Controller / Assistant Controller)</div>
      </div>
    </div>

    <div class="disclaimer">${esc(REPORT_DISCLAIMER)}</div>
  </section>

</div>
</body>
</html>`;
}

/** Footer used by Puppeteer for page numbering. Kept next to the template. */
export function reportFooterTemplate(scanId: string): string {
  return `
  <div style="width:100%;font-family:${fontStack};font-size:7pt;color:${palette.inkMuted};
              padding:0 12mm;display:flex;justify-content:space-between;align-items:center;">
    <span>Legal Metrology Compliance Report &middot; Ref. LM/${esc(shortRef(scanId))}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}
