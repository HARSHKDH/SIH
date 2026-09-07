import { ApiError } from './errors';

/**
 * A small fixed-window limiter for the login route.
 *
 * Scope note: this counter lives in the process, so it protects a single Next
 * instance. Behind a load balancer the same budget would need to move to Redis —
 * which is already a dependency, so that is a config change rather than a
 * redesign. It is here because an unthrottled login endpoint on an enforcement
 * tool is an open invitation to credential stuffing.
 */
interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Drops expired windows so the map cannot grow without bound. */
function sweep(now: number) {
  if (buckets.size < 512) return;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function consumeRateLimit({ key, limit, windowMs }: RateLimitOptions): void {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > limit) {
    const seconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new ApiError(
      429,
      `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
      'rate_limited',
    );
  }
}

/** Clears the window after a successful login so a legitimate user is not punished. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client identity for rate limiting. `x-forwarded-for` is only
 * trustworthy behind a proxy that sets it, which is the normal deployment shape
 * for this app; the fallback keeps local development working.
 */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
