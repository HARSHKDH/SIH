'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Deliberately a no-op in development: a cached shell is exactly the wrong thing
 * while iterating on the UI, and stale-asset bugs are miserable to diagnose. Any
 * previously installed worker is unregistered on the way through so a developer who
 * once ran a production build locally is not left with a ghost cache.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => void registration.unregister());
      });
      return;
    }

    // Wait for `load` so registration never competes with the first paint on a
    // slow mobile connection.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.warn('[pwa] service worker registration failed:', error);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
