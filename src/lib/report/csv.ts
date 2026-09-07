/**
 * CSV serialisation for the scan register.
 *
 * Hand-rolled rather than pulled from a package, because correct CSV is about twenty
 * lines and the failure modes are all in the escaping — which a dependency would hide
 * rather than remove.
 *
 * Three details that matter for a file an officer will open in Excel:
 *
 *  - RFC 4180 quoting: any field containing a comma, quote or newline is wrapped in
 *    quotes and its own quotes are doubled. Label text routinely contains commas.
 *  - CRLF line endings, which Excel expects.
 *  - A UTF-8 BOM. Without it Excel on Windows reads the file as ANSI and mangles the
 *    rupee sign and Devanagari product names — the exact characters this data is full of.
 */

const NEEDS_QUOTING = /[",\r\n]/;

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!NEEDS_QUOTING.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/** `scan-register-2026-09-06.csv` */
export function csvFileName(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
