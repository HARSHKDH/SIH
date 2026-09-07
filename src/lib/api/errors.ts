import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * A thrown error that carries an HTTP status. Route handlers throw these freely
 * and `withRoute` turns them into a consistent JSON error envelope.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details?: unknown) {
    return new ApiError(400, message, 'bad_request', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'unauthorized');
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message, 'forbidden');
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, message, 'not_found');
  }
  static conflict(message = 'Already exists') {
    return new ApiError(409, message, 'conflict');
  }
  static tooLarge(message = 'File is too large') {
    return new ApiError(413, message, 'payload_too_large');
  }
  static internal(message = 'Something went wrong on our side') {
    return new ApiError(500, message, 'internal_error');
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          code: 'validation_error',
          message: 'The submitted data is not valid.',
          details: error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  // Anything unrecognised is a bug. Log it server-side, stay vague client-side.
  console.error('[api] Unhandled route error:', error);
  return NextResponse.json<ApiErrorBody>(
    { error: { code: 'internal_error', message: 'Something went wrong on our side.' } },
    { status: 500 },
  );
}

/**
 * Wraps a route handler so every thrown error becomes a well-formed response.
 * Keeps the happy path of each handler free of try/catch noise.
 *
 * The return type is the plain `Response` rather than `NextResponse` because the
 * file and report routes stream binary bodies; `NextResponse` extends `Response`,
 * so JSON handlers still type-check unchanged.
 */
export function withRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
