import type { ApiErrorBody } from '@/lib/api/errors';

/**
 * Thin fetch wrapper for client components.
 *
 * Its whole job is to turn the API's error envelope into a thrown `Error` whose
 * message is already fit to display. Without this every form would re-implement
 * "did this response have a JSON error body, and if so where is the message?".
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  );
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // A thrown fetch means the network is gone, not that the server said no.
    throw new HttpError(0, 'No connection. Check your network and try again.', 'offline');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new HttpError(
        response.status,
        payload.error.message,
        payload.error.code,
        payload.error.details,
      );
    }
    throw new HttpError(response.status, `Request failed (${response.status}).`);
  }

  return payload as T;
}

/** Extracts a displayable message from anything thrown by `apiFetch` or elsewhere. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Pulls per-field messages out of a 422 so a form can show them inline.
 * Returns an empty object for any other error shape.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof HttpError) || error.code !== 'validation_error') return {};
  if (typeof error.details !== 'object' || error.details === null) return {};

  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.details as Record<string, unknown>)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') {
      result[field] = messages[0];
    }
  }
  return result;
}
