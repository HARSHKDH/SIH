'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import type { SessionUserDto } from '@/lib/api/dto';

import { CloseIcon } from './icons';
import { isNavItemActive, visibleNavItems } from './nav-items';

/**
 * Fixed navigation rail.
 *
 * Deep slate (#1E3A5F) with light text, permanently visible from `lg` up and
 * presented as an overlay drawer below that. The dark rail does double duty: it
 * frames the light content area and it reads as institutional software rather than
 * a consumer app.
 */
export function Sidebar({
  user,
  open,
  onClose,
}: {
  user: SessionUserDto;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const items = visibleNavItems(user.role);

  return (
    <>
      {/* Scrim for the mobile drawer. */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-ink/40 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <nav
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col bg-brand',
          'transition-transform duration-200 ease-out lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* --- Masthead --- */}
        <div className="flex h-topbar items-center gap-2.5 border-b border-white/10 px-4">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-white/10 text-body font-semibold text-white"
            aria-hidden="true"
          >
            LM
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label font-semibold leading-tight text-white">
              Legal Metrology
            </span>
            <span className="block truncate text-micro uppercase tracking-wider text-white/60">
              Compliance Checker
            </span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-control text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* --- Links --- */}
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-control px-3 py-2.5 text-body transition-colors',
                    active
                      ? 'bg-white/12 font-semibold text-white'
                      : 'font-medium text-white/70 hover:bg-white/8 hover:text-white',
                  )}
                >
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-white/60')} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* --- Statutory footer: this is enforcement software, say so. --- */}
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-micro leading-relaxed text-white/50">
            Legal Metrology Act, 2009
            <br />
            Packaged Commodities Rules, 2011
          </p>
        </div>
      </nav>
    </>
  );
}
