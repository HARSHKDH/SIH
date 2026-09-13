import { sniffImageMediaType } from '@/lib/extraction/image';

import { ALLOWED_ATTACHMENT_TYPES, type AllowedAttachmentType } from './types';

/**
 * Content-type verification for supporting evidence.
 *
 * The declared Content-Type is never trusted. On the local driver the bytes pass
 * through `/api/uploads/local`, but with S3 configured the browser PUTs straight at
 * the bucket and nothing in this process ever sees them — so the record step sniffs
 * again before an Attachment row is written. That second check is the only validation
 * an S3 upload gets, which is why it is not treated as redundant.
 */

/** `%PDF-` — the only signature the PDF specification permits at offset 0. */
const PDF_MAGIC = '%PDF-';

export function isPdf(buffer: Buffer): boolean {
  return buffer.length >= PDF_MAGIC.length && buffer.subarray(0, 5).toString('latin1') === PDF_MAGIC;
}

/**
 * Returns the media type the bytes actually are, or null when they are not something
 * this system accepts as evidence. HEIC is sniffed by the image sniffer and rejected
 * here: unlike the label photograph it would never reach the vision model, but it
 * still cannot be displayed to a reviewing officer in a browser.
 */
export function sniffAttachmentType(buffer: Buffer): AllowedAttachmentType | null {
  if (isPdf(buffer)) return 'application/pdf';

  const image = sniffImageMediaType(buffer);
  if (image === null) return null;

  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(image)
    ? (image as AllowedAttachmentType)
    : null;
}
