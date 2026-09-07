/* eslint-disable no-restricted-globals */
/**
 * Service worker for the Legal Metrology Compliance Checker.
 *
 * Written by hand rather than generated, because what may and may not be cached in
 * this app is a compliance question, not a performance one:
 *
 *   - Navigations use network-first with an offline fallback, so an officer who walks
 *     into a dead spot gets a clear "you are offline" page instead of a browser error.
 *   - Build assets are immutable and cached forever (cache-first).
 *   - **Nothing under /api is ever cached.** Scan findings, label photographs and PDF
 *     reports are evidence; serving a stale compliance verdict from a cache would be
 *     worse than showing nothing at all. Every /api request goes straight to the
 *     network, and a failed one fails honestly.
 */

const VERSION = 'v1';
const SHELL_CACHE = `lm-shell-${VERSION}`;
const ASSET_CACHE = `lm-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const SHELL_ASSETS = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload` bypasses the HTTP cache so an update never installs stale shell files.
      await cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** True for anything that must never be served from a cache. */
function isNeverCacheable(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/login' ||
    url.pathname.startsWith('/_next/data/')
  );
}

/** Immutable build output, safe to cache indefinitely. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cacheable; a POST to /api/scans must always hit the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ignore cross-origin requests (for example presigned S3 uploads).
  if (url.origin !== self.location.origin) return;

  if (isNeverCacheable(url)) return;

  // ---- Navigations: network-first, offline page as the fallback ----
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })(),
    );
    return;
  }

  // ---- Immutable assets: cache-first ----
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (error) {
          if (cached) return cached;
          throw error;
        }
      })(),
    );
  }

  // Everything else falls through to the browser's normal handling.
});

/** Lets a future in-app "update available" prompt activate the new worker. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
