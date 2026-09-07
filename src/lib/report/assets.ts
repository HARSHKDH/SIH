import { RULE_CLAUSES, TOTAL_RULE_WEIGHT } from '@/lib/rules/registry';

/**
 * Small report helpers, kept out of `index.ts` so `build.ts` can use them without an
 * import cycle (index -> build -> index).
 */

/** Chrome chokes on very large data URIs; skip embedding beyond this size. */
export const MAX_EMBEDDED_IMAGE_BYTES = 6 * 1024 * 1024;

export function buildImageDataUri(bytes: Buffer, contentType: string): string | null {
  if (bytes.length === 0 || bytes.length > MAX_EMBEDDED_IMAGE_BYTES) return null;
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

export const ruleBookSummary = `${RULE_CLAUSES.length} clauses, ${TOTAL_RULE_WEIGHT} total weight`;
