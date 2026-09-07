/**
 * Minimal structured logging for the worker.
 *
 * The worker is a long-running background process whose output is the only
 * window into the pipeline, so every line carries a timestamp, a level and the
 * scan id it relates to. No logging library: one file is easier to reason about
 * than a transport configuration.
 */
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), message];
  if (context && Object.keys(context).length > 0) {
    parts.push(
      Object.entries(context)
        .map(([key, value]) => `${key}=${format(value)}`)
        .join(' '),
    );
  }
  const line = parts.join(' | ');

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function format(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '-';
  if (typeof value === 'string') return value.includes(' ') ? JSON.stringify(value) : value;
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const log = {
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
