/**
 * Extraction failures split cleanly into two kinds, and the worker treats them
 * very differently:
 *
 *  - `retryable: true`  — transient (rate limit, timeout, 5xx). BullMQ should
 *                         back off and try again.
 *  - `retryable: false` — the input itself is wrong (unsupported format, not a
 *                         label). Retrying wastes API budget, so the scan is
 *                         failed immediately with a message the officer can act on.
 */
export class ExtractionError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  /** Message safe to show an officer in the UI. */
  readonly officerMessage: string;

  constructor(options: {
    code: string;
    message: string;
    officerMessage?: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ExtractionError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.officerMessage = options.officerMessage ?? options.message;
  }

  static unsupportedFormat(detected: string | null) {
    return new ExtractionError({
      code: 'unsupported_image_format',
      message: `Unsupported image format for vision extraction: ${detected ?? 'unrecognised'}`,
      officerMessage:
        detected === 'image/heic' || detected === 'image/heif'
          ? 'This photo is in HEIC format, which the vision model cannot read. Re-take or export it as JPEG and upload again.'
          : 'This file is not a readable JPEG, PNG or WebP image. Please upload a standard photo of the label.',
      retryable: false,
    });
  }

  static emptyImage() {
    return new ExtractionError({
      code: 'empty_image',
      message: 'Image object is empty (0 bytes)',
      officerMessage: 'The uploaded image is empty. Please upload the label photo again.',
      retryable: false,
    });
  }

  static malformedResponse(details: string) {
    return new ExtractionError({
      code: 'malformed_model_response',
      message: `Vision model returned data that failed schema validation: ${details}`,
      officerMessage:
        'The extraction service returned an unexpected response. Retry the scan; if it keeps failing, report it to the administrator.',
      retryable: true,
    });
  }

  static apiFailure(message: string, retryable: boolean, cause?: unknown) {
    return new ExtractionError({
      code: 'vision_api_error',
      message: `Vision API call failed: ${message}`,
      officerMessage: retryable
        ? 'The extraction service is temporarily unavailable. Retry the scan in a moment.'
        : 'The extraction service rejected this request. Please report it to the administrator.',
      retryable,
      cause,
    });
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof ExtractionError) return error.retryable;
  // Unknown failures get the benefit of the doubt — BullMQ caps total attempts.
  return true;
}

/** Extracts an officer-facing message from any thrown value. */
export function toOfficerMessage(error: unknown): string {
  if (error instanceof ExtractionError) return error.officerMessage;
  if (error instanceof Error && error.message) return error.message;
  return 'Processing failed for an unknown reason.';
}
