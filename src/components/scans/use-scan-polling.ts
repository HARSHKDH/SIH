'use client';

import { useEffect, useRef, useState } from 'react';

import type { ScanDetailDto } from '@/lib/api/dto';
import { apiFetch, errorMessage } from '@/lib/http';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);

/**
 * Polls a scan until it reaches a terminal state.
 *
 * Polling rather than websockets, deliberately. The job takes seconds, not minutes;
 * a single officer watches a single scan; and a poll survives the flaky mobile
 * connectivity this app is built for — a dropped socket needs reconnection logic,
 * a dropped poll just succeeds on the next tick. The interval backs off from 1.5s to
 * 5s so a slow vision call does not generate a hundred requests, and polling stops
 * entirely once the tab is hidden.
 */
export function useScanPolling(
  scanId: string | null,
  initial: ScanDetailDto | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const [scan, setScan] = useState<ScanDetailDto | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startedAt = useRef<number>(Date.now());
  const attempts = useRef(0);

  const isTerminal = scan ? TERMINAL_STATUSES.has(scan.status) : false;
  const active = Boolean(scanId) && enabled && !isTerminal;

  // Reset the clock whenever a different scan comes into view.
  useEffect(() => {
    startedAt.current = Date.now();
    attempts.current = 0;
    setElapsedSeconds(0);
    setError(null);
    setScan(initial);
    // `initial` is a fresh object each render on the server-rendered pages, so the
    // scan id is the honest dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // Elapsed-time ticker, purely for display.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || !scanId) return;

    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      if (cancelled) return;

      // Nothing to show while backgrounded, so do not spend the officer's data.
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(tick, 2000);
        return;
      }

      try {
        const result = await apiFetch<{ scan: ScanDetailDto }>(`/api/scans/${scanId}`);
        if (cancelled) return;

        setScan(result.scan);
        setError(null);

        if (TERMINAL_STATUSES.has(result.scan.status)) return;
      } catch (caught) {
        if (cancelled) return;
        // A transient failure mid-processing is not worth alarming the officer about;
        // only surface it once it has persisted for a few attempts.
        attempts.current += 1;
        if (attempts.current >= 3) setError(errorMessage(caught, 'Lost contact with the server.'));
      }

      attempts.current += 1;
      const delay = Math.min(1500 + attempts.current * 400, 5000);
      timer = window.setTimeout(tick, delay);
    }

    timer = window.setTimeout(tick, 1200);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, scanId]);

  return {
    scan,
    setScan,
    error,
    elapsedSeconds,
    isPolling: active,
    isTerminal,
  };
}
