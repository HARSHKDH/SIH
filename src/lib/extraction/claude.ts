import Anthropic, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  RateLimitError,
} from '@anthropic-ai/sdk';

import { env, requireAnthropicKey } from '@/lib/env';

import { ExtractionError } from './errors';
import { isVisionMediaType, sniffImageMediaType } from './image';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from './prompt';
import {
  EXTRACTION_TOOL_NAME,
  EXTRACTION_TOOL_SCHEMA,
  labelExtractionSchema,
  type LabelExtraction,
} from './schema';

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: requireAnthropicKey(),
      // The SDK's own retry handles blips; BullMQ handles the longer-lived ones.
      maxRetries: 2,
      timeout: 90_000,
    });
  }
  return cachedClient;
}

/** 429s, connection drops and 5xx are worth another attempt. 4xx are not. */
function classifyApiError(error: unknown): ExtractionError {
  if (error instanceof RateLimitError) {
    return ExtractionError.apiFailure('rate limited by the vision API', true, error);
  }
  if (error instanceof APIConnectionError || error instanceof APIUserAbortError) {
    return ExtractionError.apiFailure('network error or timeout reaching the vision API', true, error);
  }
  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : 0;
    const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
    return ExtractionError.apiFailure(`${status} ${error.message}`, retryable, error);
  }
  return ExtractionError.apiFailure(
    error instanceof Error ? error.message : 'unknown error',
    true,
    error,
  );
}

export interface ClaudeExtractionInput {
  imageBytes: Buffer;
  productName?: string | null;
  /** Captured e-commerce page text, when the subject is a listing rather than a pack. */
  listingText?: string | null;
}

export interface ClaudeExtractionResult {
  extraction: LabelExtraction;
  meta: {
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    mediaType: string;
    source: 'claude';
  };
}

/**
 * Calls Claude's vision API and returns a schema-validated extraction.
 *
 * JSON is *forced* rather than requested: the response shape is declared as a
 * tool input schema and `tool_choice` pins the model to that single tool, so
 * there is no prose to parse and no "```json" fence to strip.
 */
export async function extractWithClaude({
  imageBytes,
  productName,
  listingText,
}: ClaudeExtractionInput): Promise<ClaudeExtractionResult> {
  if (imageBytes.length === 0) throw ExtractionError.emptyImage();

  const detected = sniffImageMediaType(imageBytes);
  if (!isVisionMediaType(detected)) throw ExtractionError.unsupportedFormat(detected);

  let response: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    response = await client().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: env.ANTHROPIC_MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [
        {
          name: EXTRACTION_TOOL_NAME,
          description:
            'Record the mandatory Legal Metrology declarations transcribed from the package label photograph.',
          input_schema: EXTRACTION_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: detected, data: imageBytes.toString('base64') },
            },
            { type: 'text', text: buildExtractionUserPrompt({ productName, listingText }) },
          ],
        },
      ],
    });
  } catch (error) {
    throw classifyApiError(error);
  }

  if ('type' in response && response.type !== 'message') {
    throw ExtractionError.malformedResponse('response was a stream, not a message');
  }

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: 'tool_use' }> =>
      block.type === 'tool_use' && block.name === EXTRACTION_TOOL_NAME,
  );

  if (!toolUse) {
    throw ExtractionError.malformedResponse(
      `no ${EXTRACTION_TOOL_NAME} tool call in response (stop_reason: ${response.stop_reason ?? 'unknown'})`,
    );
  }

  const parsed = labelExtractionSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw ExtractionError.malformedResponse(
      JSON.stringify(parsed.error.flatten().fieldErrors).slice(0, 500),
    );
  }

  return {
    extraction: parsed.data,
    meta: {
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      mediaType: detected,
      source: 'claude',
    },
  };
}
