import { ApiError, GoogleGenAI } from '@google/genai';

import { env, geminiModelChain, requireGeminiKey } from '@/lib/env';

import { ExtractionError } from './errors';
import { isVisionMediaType, sniffImageMediaType } from './image';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from './prompt';
import {
  GEMINI_EXTRACTION_SCHEMA,
  labelExtractionSchema,
  type LabelExtraction,
} from './schema';

let cachedClient: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: requireGeminiKey() });
  }
  return cachedClient;
}

/** 429, 408 and 5xx are worth another attempt. Other 4xx are the caller's fault. */
function classifyApiError(error: unknown): ExtractionError {
  if (error instanceof ApiError) {
    const status = typeof error.status === 'number' ? error.status : 0;
    const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
    return ExtractionError.apiFailure(`${status} ${error.message}`, retryable, error);
  }

  // Network-level failures surface as plain TypeErrors from fetch.
  if (error instanceof Error && /fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|network/i.test(error.message)) {
    return ExtractionError.apiFailure('network error reaching the vision API', true, error);
  }

  return ExtractionError.apiFailure(
    error instanceof Error ? error.message : 'unknown error',
    true,
    error,
  );
}

/**
 * Strips a markdown fence if the model wrapped its JSON in one.
 *
 * With `responseMimeType: application/json` this should never be necessary, which
 * is exactly why it is here: the cost is four lines, and the failure it prevents is
 * a scan failing on a technicality after the model did the work correctly.
 */
function unwrapJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export interface GeminiExtractionInput {
  imageBytes: Buffer;
  productName?: string | null;
  /** Captured e-commerce page text, when the subject is a listing rather than a pack. */
  listingText?: string | null;
}

export interface GeminiExtractionResult {
  extraction: LabelExtraction;
  meta: {
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    mediaType: string;
    source: 'gemini';
  };
}

/**
 * Calls Gemini's vision API and returns a schema-validated extraction.
 *
 * JSON is *forced* rather than requested: `responseMimeType: application/json`
 * combined with `responseJsonSchema` constrains decoding to the declared shape, so
 * there is no prose to strip and no chance of a conversational preamble. The same
 * canonical schema drives both providers (see `toGeminiJsonSchema`), and the same
 * no-hallucination system prompt is used verbatim — so switching provider does not
 * quietly change what the model is asked to do.
 *
 * `temperature: 0` because this is transcription, not composition. There is exactly
 * one correct reading of a label and no value in sampling alternatives.
 */
export async function extractWithGemini({
  imageBytes,
  productName,
  listingText,
}: GeminiExtractionInput): Promise<GeminiExtractionResult> {
  if (imageBytes.length === 0) throw ExtractionError.emptyImage();

  const detected = sniffImageMediaType(imageBytes);
  if (!isVisionMediaType(detected)) throw ExtractionError.unsupportedFormat(detected);

  const request = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: detected, data: imageBytes.toString('base64') } },
          { text: buildExtractionUserPrompt({ productName, listingText }) },
        ],
      },
    ],
    config: {
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseJsonSchema: GEMINI_EXTRACTION_SCHEMA,
      temperature: 0,
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(90_000),
    },
  };

  /**
   * Try the primary model, then each fallback, on capacity errors only.
   *
   * The newest Flash model is the most contended, and a 503 "this model is currently
   * experiencing high demand" is common and short-lived. Waiting for the queue's
   * backoff wastes 30+ seconds of an officer's time when an older Flash model would
   * have answered immediately and reads a label just as accurately. A *non*-capacity
   * error (bad key, malformed request) is not retried against other models, because it
   * would fail identically on all of them.
   */
  const chain = geminiModelChain();
  let response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>> | null = null;
  let usedModel = chain[0];
  let lastError: ExtractionError | null = null;

  for (const [index, model] of chain.entries()) {
    try {
      response = await client().models.generateContent({ model, ...request });
      usedModel = model;
      if (index > 0) {
        console.warn(`[extraction] ${chain[0]} was unavailable; served by fallback ${model}`);
      }
      break;
    } catch (error) {
      const classified = classifyApiError(error);
      lastError = classified;
      // Only a transient capacity/availability failure justifies another model.
      if (!classified.retryable) throw classified;
    }
  }

  if (!response) {
    throw (
      lastError ??
      ExtractionError.apiFailure('no Gemini model was available', true)
    );
  }

  const text = response.text;
  if (!text || text.trim().length === 0) {
    // Usually a safety block or a token ceiling hit before any content was emitted.
    const reason = response.candidates?.[0]?.finishReason ?? 'unknown';
    throw ExtractionError.malformedResponse(`empty response from the model (finishReason: ${reason})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJson(text));
  } catch {
    /*
     * Name the cause when it is knowable.
     *
     * Hitting the output ceiling mid-object is the common way this fails, and it presents
     * as a JSON syntax error hundreds of characters in — which sends you looking at the
     * parser instead of at `GEMINI_MAX_OUTPUT_TOKENS`. `finishReason` distinguishes the
     * two, and the fix for each is different, so the message says which.
     */
    const finishReason = response.candidates?.[0]?.finishReason ?? 'unknown';
    if (finishReason === 'MAX_TOKENS') {
      throw ExtractionError.malformedResponse(
        `the model hit the output token ceiling mid-response, leaving truncated JSON ` +
          `(${text.length} characters returned). Raise GEMINI_MAX_OUTPUT_TOKENS, currently ` +
          `${env.GEMINI_MAX_OUTPUT_TOKENS}.`,
      );
    }
    throw ExtractionError.malformedResponse(
      `response was not valid JSON (finishReason: ${finishReason}): ${text.slice(0, 300)}`,
    );
  }

  const validated = labelExtractionSchema.safeParse(parsed);
  if (!validated.success) {
    throw ExtractionError.malformedResponse(
      JSON.stringify(validated.error.flatten().fieldErrors).slice(0, 500),
    );
  }

  return {
    extraction: validated.data,
    meta: {
      // The model that actually served the request, which may be a fallback.
      model: response.modelVersion ?? usedModel,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      mediaType: detected,
      source: 'gemini',
    },
  };
}
