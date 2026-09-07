import { extractionProvider, type ExtractionProvider } from '@/lib/env';

import { extractWithClaude } from './claude';
import { ExtractionError } from './errors';
import { extractWithGemini } from './gemini';
import { sniffImageMediaType } from './image';
import { extractWithMock } from './mock';
import type { LabelExtraction } from './schema';

export interface ExtractionInput {
  imageBytes: Buffer;
  productName?: string | null;
  /**
   * Visible text captured from an e-commerce product page.
   *
   * Present only for listing scans. When supplied, the extractor is told that a
   * declaration published as page text counts as declared (Rule 6(10)), because the
   * subject of that assessment is the product display page rather than a physical pack.
   */
  listingText?: string | null;
}

export interface ExtractionMeta {
  /** Which provider produced this reading. Recorded so a finding stays traceable. */
  source: ExtractionProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  mediaType: string;
  archetype?: string;
  durationMs: number;
}

export interface ExtractionOutcome {
  extraction: LabelExtraction;
  meta: ExtractionMeta;
}

/**
 * The single entry point the worker calls.
 *
 * Provider selection happens once at startup in `src/lib/env.ts` and is a pure
 * lookup here. All three providers return the same zod-validated shape, so the rule
 * engine, the database writes and the PDF report are entirely unaware of which one
 * ran — which is what makes swapping Gemini for Claude a one-line env change rather
 * than a refactor.
 */
export async function extractLabelDeclarations({
  imageBytes,
  productName,
  listingText,
}: ExtractionInput): Promise<ExtractionOutcome> {
  const startedAt = Date.now();

  if (imageBytes.length === 0) throw ExtractionError.emptyImage();

  if (extractionProvider === 'mock') {
    const detected = sniffImageMediaType(imageBytes);
    if (detected === null) throw ExtractionError.unsupportedFormat(null);

    const result = extractWithMock(imageBytes, detected);
    return {
      extraction: result.extraction,
      meta: { ...result.meta, durationMs: Date.now() - startedAt },
    };
  }

  const result =
    extractionProvider === 'gemini'
      ? await extractWithGemini({ imageBytes, productName, listingText })
      : await extractWithClaude({ imageBytes, productName, listingText });

  return {
    extraction: result.extraction,
    meta: { ...result.meta, durationMs: Date.now() - startedAt },
  };
}

export { ExtractionError, isRetryable, toOfficerMessage } from './errors';
export { MOCK_ARCHETYPE_NAMES, mockArchetypeByName } from './mock';
export type { ExtractionProvider } from '@/lib/env';
export * from './schema';
