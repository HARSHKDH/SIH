export type StorageDriverName = 'local' | 's3';

/**
 * What an upload grant is for. The size cap and the accepted media types differ
 * between the two, and the purpose is signed into the token so a grant issued for a
 * supporting document cannot be spent on a scan image or vice versa.
 */
export type UploadPurpose = 'scan-image' | 'attachment';

/** Everything the browser needs to push bytes straight at the object store. */
export interface UploadTarget {
  driver: StorageDriverName;
  /** Storage key the object will live at. Persisted on the Scan row. */
  key: string;
  /** Absolute (S3) or app-relative (local) URL to PUT the bytes to. */
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  /** URL the app uses to display the object afterwards. */
  publicUrl: string;
  expiresInSeconds: number;
}

export interface StoredObject {
  key: string;
  url: string;
}

export interface ObjectBytes {
  body: Buffer;
  contentType: string;
}

/**
 * The two storage back-ends implement the same surface, so nothing above this
 * layer (routes, worker, PDF writer) knows or cares which one is active.
 */
export interface StorageDriver {
  readonly name: StorageDriverName;
  createUploadTarget(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
    /** Defaults to `'scan-image'` so existing callers are unaffected. */
    purpose?: UploadPurpose;
  }): Promise<UploadTarget>;
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<StoredObject>;
  getObject(key: string): Promise<ObjectBytes>;
  /** Cheap existence probe — `stat` locally, `HeadObject` on S3. */
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  publicUrl(key: string): string;
}

/** Keys the app will accept as a scan image. Stops a Scan row pointing at a report. */
export const SCAN_IMAGE_KEY_PREFIX = 'scans/';

/** Keys the app will accept as supporting evidence, for the same reason. */
export const ATTACHMENT_KEY_PREFIX = 'attachments/';

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB — generous for a phone photo.

/**
 * Supporting evidence is broader than the label photograph: a second angle of the
 * pack, a shelf photograph, or a scanned invoice or test certificate as PDF.
 *
 * Deliberately narrow beyond that. Office formats carry macros and the archive
 * formats carry anything at all, and none of them can be shown to a reviewing
 * officer inline, so accepting them would add attack surface for no gain. An officer
 * with a spreadsheet exports it to PDF.
 */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB — a multi-page scanned PDF.

/** How many pieces of supporting evidence one scan may carry. */
export const MAX_ATTACHMENTS_PER_SCAN = 10;

export function maxBytesForPurpose(purpose: UploadPurpose): number {
  return purpose === 'attachment' ? MAX_ATTACHMENT_BYTES : MAX_IMAGE_BYTES;
}

/** "15 MB" — for error messages, so the number is never written out twice. */
export function describeByteLimit(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'jpg';
  }
}

export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'pdf':
      return 'application/pdf';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}
