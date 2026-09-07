import type { Metadata, Viewport } from 'next';

import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { env } from '@/lib/env';
import { palette } from '@/lib/design/tokens';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: env.NEXT_PUBLIC_APP_NAME,
    template: `%s · ${env.NEXT_PUBLIC_APP_NAME}`,
  },
  description:
    'Compliance screening for pre-packaged commodities under the Legal Metrology (Packaged Commodities) Rules, 2011. Photograph a label, get an auditable violation report.',
  applicationName: env.NEXT_PUBLIC_APP_NAME,
  manifest: '/manifest.webmanifest',
  // This is an internal enforcement tool; it has no business in a search index.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    title: 'LM Compliance',
    statusBarStyle: 'black-translucent',
  },
  other: {
    // Chrome deprecated `apple-mobile-web-app-capable` in favour of this. Next's
    // `appleWebApp.capable` still emits the legacy tag for older iOS, so both are
    // present: the standard one for current browsers, the Apple one for compatibility.
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom: an officer squinting at fine print on a label photo
  // needs to be able to magnify the screen.
  maximumScale: 5,
  themeColor: palette.brand,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      {/*
        Browser extensions (Grammarly, password managers) inject attributes onto <body>
        before React hydrates, which React reports as a server/client attribute
        mismatch. Suppressing it here silences that false positive without hiding real
        hydration bugs, which surface on the components themselves rather than <body>.
      */}
      <body suppressHydrationWarning>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
