'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import type { SessionUserDto } from '@/lib/api/dto';
import type { ExtractionProvider } from '@/lib/env';

import { Sidebar } from './sidebar';
import { TopBar } from './topbar';

/**
 * Application chrome: fixed dark rail, top bar, light content area.
 *
 * Only the drawer's open/closed state lives on the client — every page inside is
 * still a server component, so the officer's scan data is rendered on the server
 * and never round-trips through client state.
 */
export function AppShell({
  user,
  extractionMode,
  children,
}: {
  user: SessionUserDto;
  extractionMode?: ExtractionProvider;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navigating from the drawer should close it; without this the overlay would
  // sit on top of the page the officer just asked for.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Stop the page behind the drawer from scrolling on touch devices.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-sidebar">
        <TopBar
          user={user}
          extractionMode={extractionMode}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
