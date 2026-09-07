/**
 * Formatting helpers safe to use in client components.
 *
 * Everything is pinned to `en-IN` and `Asia/Kolkata`. Timestamps on an
 * enforcement record must not shift depending on the browser's locale — an
 * officer and a reviewer looking at the same scan have to read the same time.
 */

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});

const TIME_ONLY = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : fallback;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? DATE_ONLY.format(date) : fallback;
}

export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? TIME_ONLY.format(date) : fallback;
}

/** Short axis label for the dashboard trend chart, e.g. "04 Sep". */
export function formatDayLabel(value: string | Date): string {
  const date = toDate(value);
  return date ? DAY_LABEL.format(date) : '';
}

/** "just now", "4 min ago", "3 h ago", then an absolute date. */
export function formatRelative(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return formatDateTime(date);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} min ago`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours} h ago`;
  }
  if (seconds < 7 * 86400) {
    const days = Math.round(seconds / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return formatDate(date);
}

/** Seconds elapsed, rendered as "0:42" — used by the processing progress panel. */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

export function formatPercent(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `${Math.round(value)}%`;
}

/** Model confidence, 0–1, as a percentage. */
export function formatConfidence(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

export function formatMillimetres(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(value < 1 ? 2 : 1)} mm`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact scan reference for tables and headings: last 10 chars, upper-cased. */
export function scanRef(scanId: string): string {
  return scanId.slice(-10).toUpperCase();
}

/**
 * The name to greet someone by.
 *
 * Officers are commonly recorded as "A. Ramaswamy", so naively taking the first
 * token yields "Good day, A." — which reads as a bug. When the first token is an
 * initial, use the full name instead.
 */
export function greetingName(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'Officer';

  const first = tokens[0];
  const isInitial = /^[A-Za-z]\.?$/.test(first);
  return isInitial ? tokens.join(' ') : first;
}
