import { z } from 'zod';

import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import {
  ALLOWED_ATTACHMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  describeByteLimit,
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_BYTES,
} from '@/lib/storage/types';

/** Request validation. Every route body and query string goes through one of these. */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const presignSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES, {
    errorMap: () => ({ message: 'Upload a JPEG, PNG or WebP photograph of the label.' }),
  }),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, `Image must be under ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`),
  productName: z.string().trim().max(180).optional().nullable(),
});

export const createScanSchema = z.object({
  imageKey: z.string().min(1),
  productName: z.string().trim().max(180).optional().nullable(),
});

/**
 * An e-commerce listing to capture.
 *
 * Only length and non-emptiness are checked here. Everything that matters about the
 * URL — scheme, port, embedded credentials, and above all where it resolves to — is
 * decided by the SSRF guard in `src/lib/listing/guard.ts`, because those checks need
 * DNS and belong in one auditable place rather than split across a zod refinement.
 */
export const createListingScanSchema = z.object({
  url: z.string().trim().min(8, 'Paste the full listing address.').max(2048, 'That address is too long.'),
  productName: z.string().trim().max(180).optional().nullable(),
});

export const updateScanSchema = z.object({
  officerNote: z.string().trim().max(4000).nullable(),
});

// ---------------------------------------------------------------------------
// Supporting evidence
// ---------------------------------------------------------------------------

/** Filenames are display-only, but an unbounded one would still bloat every report. */
const attachmentFileName = z
  .string()
  .trim()
  .min(1, 'The file must have a name.')
  .max(180, 'That filename is too long.');

export const attachmentPresignSchema = z.object({
  contentType: z.enum(ALLOWED_ATTACHMENT_TYPES, {
    errorMap: () => ({
      message: 'Attach a JPEG, PNG or WebP photograph, or a PDF document.',
    }),
  }),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(
      MAX_ATTACHMENT_BYTES,
      `Each attachment must be under ${describeByteLimit(MAX_ATTACHMENT_BYTES)}.`,
    ),
  fileName: attachmentFileName,
});

export const createAttachmentSchema = z.object({
  fileKey: z.string().min(1),
  fileName: attachmentFileName,
  caption: z.string().trim().max(500).optional().nullable(),
});

export const SCAN_SORT_FIELDS = ['createdAt', 'complianceScore', 'productName'] as const;

export const scanListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Free-text match against the product name. */
  search: z.string().trim().max(180).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  severity: z.enum(['CRITICAL', 'MODERATE', 'MINOR']).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  from: z.string().datetime({ offset: true }).or(z.coerce.date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.coerce.date()).optional(),
  sort: z.enum(SCAN_SORT_FIELDS).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  /** ADMIN only — narrow the list to one officer. */
  officerId: z.string().trim().min(1).optional(),
  /** ADMIN only — see every officer's scans instead of just their own. */
  scope: z.enum(['mine', 'all']).default('mine'),
});

export type ScanListQuery = z.infer<typeof scanListQuerySchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Enter the officer\u2019s full name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(200),
  role: z.enum(['OFFICER', 'ADMIN']).default('OFFICER'),
  designation: z.string().trim().max(120).optional().nullable(),
  jurisdiction: z.string().trim().max(120).optional().nullable(),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(['OFFICER', 'ADMIN']).optional(),
    isActive: z.boolean().optional(),
    designation: z.string().trim().max(120).nullable().optional(),
    jurisdiction: z.string().trim().max(120).nullable().optional(),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

/** Parses a URLSearchParams into a plain object before zod validation. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (value !== '') result[key] = value;
  }
  return result;
}
