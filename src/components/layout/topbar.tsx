'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SessionUserDto } from '@/lib/api/dto';
import { cn } from '@/lib/cn';
import type { ExtractionProvider } from '@/lib/env';
import { ROLE_LABEL } from '@/lib/labels';

import { LogoutIcon, MenuIcon } from './icons';

/**
 * Top bar: who is signed in, and how to sign out.
 *
 * Showing the officer's name and role permanently is a deliberate choice for
 * accountability software — every action recorded in this system is attributed to
 * a named official, so the screen should never leave any doubt about who that is.
 */
export function TopBar({
  user,
  onOpenSidebar,
  extractionMode,
}: {
  user: SessionUserDto;
  onOpenSidebar: () => void;
  extractionMode?: ExtractionProvider;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — the two things a user expects from a menu.
  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // Full navigation rather than a client push: it clears every cached server
      // component payload, so no scan data lingers after sign-out.
      window.location.assign('/login');
    }
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-control text-ink-secondary hover:bg-brand-muted hover:text-brand lg:hidden"
        aria-label="Open navigation"
        aria-controls="app-sidebar"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        {extractionMode === 'mock' ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-moderate-border bg-moderate-soft px-2.5 py-1 text-micro font-semibold uppercase tracking-wider text-moderate">
            <span className="h-1.5 w-1.5 rounded-pill bg-current" aria-hidden="true" />
            Offline extraction mode
          </span>
        ) : null}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={cn(
            'flex items-center gap-2.5 rounded-control py-1 pl-1 pr-2 transition-colors',
            menuOpen ? 'bg-brand-muted' : 'hover:bg-brand-muted',
          )}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand text-label font-semibold text-ink-inverse"
            aria-hidden="true"
          >
            {initials || '?'}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[12rem] truncate text-label font-semibold leading-tight text-ink">
              {user.name}
            </span>
            <span className="block max-w-[12rem] truncate text-micro text-ink-muted">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
          <svg
            className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', menuOpen && 'rotate-180')}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1.5 w-64 animate-fade-in overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-body font-semibold text-ink">{user.name}</p>
              <p className="mt-0.5 truncate text-label text-ink-secondary">{user.email}</p>
              <p className="mt-1.5 text-micro uppercase tracking-wider text-ink-muted">
                {ROLE_LABEL[user.role]}
              </p>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-body text-ink-secondary transition-colors hover:bg-surface-muted hover:text-critical disabled:opacity-60"
            >
              <LogoutIcon className="h-4 w-4" />
              {signingOut ? 'Signing out\u2026' : 'Sign out'}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
