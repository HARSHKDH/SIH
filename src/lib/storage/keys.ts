import { randomBytes } from 'node:crypto';

import { extensionForContentType } from './types';

/** Lower-cases, strips punctuation and collapses whitespace into single dashes. */
export function slugify(input: string, maxLength = 48): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  return slug || 'label';
}

/**
 * Keys are validated on every read and write. The pattern deliberately forbids
 * "..", backslashes, leading slashes and absolute Windows paths so that a
 * hostile key can never escape the storage root or the bucket prefix.
 */
const SAFE_KEY = /^[a-z0-9][a-z0-9._/-]{0,254}$/;

export function isSafeKey(key: string): boolean {
  if (!SAFE_KEY.test(key)) return false;
  if (key.includes('..')) return false;
  if (key.includes('//')) return false;
  if (key.endsWith('/')) return false;
  return true;
}

export function assertSafeKey(key: string): string {
  if (!isSafeKey(key)) {
    throw new Error(`Unsafe storage key rejected: ${JSON.stringify(key)}`);
  }
  return key;
}

/**
 * The authenticated read path for a stored object.
 *
 * Persist this rather than `storage.publicUrl(key)`: on the S3 driver that method
 * returns a real bucket URL, which only resolves if the bucket is public. Reads are
 * meant to funnel through `/api/files/<key>` so the session check still applies and
 * bucket policy can stay closed.
 */
export function appFileUrl(key: string): string {
  return `/api/files/${assertSafeKey(key)}`;
}

/** `scans/2026/09/label-photo-3f9a1c2b8d.jpg` */
export function buildScanImageKey(productName: string | null | undefined, contentType: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const suffix = randomBytes(6).toString('hex');
  const name = slugify(productName?.trim() || 'label-photo');
  return `scans/${year}/${month}/${name}-${suffix}.${extensionForContentType(contentType)}`;
}

/** `reports/compliance-report-<scanId>.pdf` */
export function buildReportKey(scanId: string): string {
  return `reports/compliance-report-${slugify(scanId, 40)}.pdf`;
}

/**
 * `attachments/<scanId>/shelf-photograph-3f9a1c2b8d.jpg`
 *
 * Grouped under the scan so the evidence for one inspection is contiguous in the
 * bucket and trivially auditable. The officer's filename only survives as a slug —
 * the real one is kept on the database row and shown in the reports, because a
 * filename off a user's machine is untrusted text and has no business in a path.
 */
export function buildAttachmentKey(
  scanId: string,
  fileName: string | null | undefined,
  contentType: string,
): string {
  const suffix = randomBytes(6).toString('hex');
  const stem = (fileName ?? '').replace(/\.[^./\\]{1,12}$/, '').trim();
  // `slugify`'s own fallback is "label", which would misdescribe an attachment, so a
  // filename with nothing sluggable in it is replaced before it reaches slugify.
  const usable = /[a-z0-9]/i.test(stem.normalize('NFKD'));
  const name = usable ? slugify(stem) : 'evidence';
  return `attachments/${slugify(scanId, 40)}/${name}-${suffix}.${extensionForContentType(contentType)}`;
}
