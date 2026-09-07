import type { ComponentType, SVGProps } from 'react';

import { AdminIcon, DashboardIcon, HistoryIcon, ScanIcon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Restricts the entry to a role. Absent means every signed-in user sees it. */
  role?: 'ADMIN';
  /**
   * When true the link is only active on an exact path match. Used for
   * `/scans/new`, which would otherwise also light up `/scans`.
   */
  exact?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { href: '/scans/new', label: 'New scan', icon: ScanIcon, exact: true },
  { href: '/scans', label: 'Scan history', icon: HistoryIcon },
  { href: '/admin', label: 'Administration', icon: AdminIcon, role: 'ADMIN' },
];

export function visibleNavItems(role: 'OFFICER' | 'ADMIN'): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.role || item.role === role);
}

/**
 * Active-state test.
 *
 * `/scans/new` is marked `exact` so it does not stay highlighted while the officer
 * is on `/scans/<id>`; `/scans` matches its children so a scan detail page keeps
 * "Scan history" lit, which is where the officer came from.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  // Never let `/scans` claim `/scans/new`, which has its own entry.
  if (item.href === '/scans' && pathname === '/scans/new') return false;
  return pathname.startsWith(`${item.href}/`);
}
