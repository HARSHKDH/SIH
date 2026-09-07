import type { DeclarationKey } from '@/lib/extraction/schema';

/**
 * Display strings shared by the web UI and the PDF report.
 *
 * Kept in one place so a declaration is never called "MFG date" on screen and
 * "Date of manufacture" in the printed record an officer hands over.
 */

export const DECLARATION_LABEL: Record<DeclarationKey, string> = {
  manufacturer_name_address: 'Manufacturer / packer / importer',
  net_quantity: 'Net quantity',
  mrp: 'Retail sale price (MRP)',
  mfg_date: 'Date of manufacture / packing',
  consumer_care: 'Consumer care details',
  country_of_origin: 'Country of origin',
  unit_sale_price: 'Unit sale price',
};

/** Short statutory pointer shown beside each declaration row. */
export const DECLARATION_RULE_REF: Record<DeclarationKey, string> = {
  manufacturer_name_address: 'Rule 6(1)(a)',
  net_quantity: 'Rule 6(1)(c)',
  mrp: 'Rule 6(1)(e)',
  mfg_date: 'Rule 6(1)(d)',
  consumer_care: 'Rule 6(1)(f)',
  country_of_origin: 'Rule 6(1), 2017 amendment',
  unit_sale_price: 'Rule 6(1) / Rule 2(m)',
};

/** Lower-case forms used inside prose sentences. */
export const DECLARATION_LABEL_INLINE: Record<DeclarationKey, string> = {
  manufacturer_name_address: 'manufacturer name and address',
  net_quantity: 'net quantity',
  mrp: 'retail sale price',
  mfg_date: 'date of manufacture',
  consumer_care: 'consumer care details',
  country_of_origin: 'country of origin',
  unit_sale_price: 'unit sale price',
};

export type ScanStatusKey = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export const SCAN_STATUS_LABEL: Record<ScanStatusKey, string> = {
  PENDING: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export const SCAN_STATUS_DESCRIPTION: Record<ScanStatusKey, string> = {
  PENDING: 'Waiting for a worker to pick up the job.',
  PROCESSING: 'Reading the label and applying the rule book.',
  COMPLETED: 'Assessment finished and the report is available.',
  FAILED: 'Processing could not be completed. Retry from the scan detail screen.',
};

/** Where the assessed material came from. Mirrors the Prisma `ScanSource` enum. */
export type ScanSourceKey = 'IMAGE_UPLOAD' | 'ECOMMERCE_LISTING';

export const SCAN_SOURCE_LABEL: Record<ScanSourceKey, string> = {
  IMAGE_UPLOAD: 'Label photograph',
  ECOMMERCE_LISTING: 'E-commerce listing',
};

export type AttachmentKindKey = 'PHOTO' | 'DOCUMENT';

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKindKey, string> = {
  PHOTO: 'Photograph',
  DOCUMENT: 'Document',
};

export const ROLE_LABEL: Record<'OFFICER' | 'ADMIN', string> = {
  OFFICER: 'Legal Metrology Officer',
  ADMIN: 'Administrator',
};
