'use client';

// The app's only chrome: a 216px sidebar on a laptop, a 62px bar at the bottom
// of a phone. Both render the same four destinations, so there is one list to
// keep honest.
//
// 'use client' for one reason: knowing which link is the current page.
// Everything below it is markup.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

type Destination = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Placeholders say so on their own page; the nav does not nag. */
  built: boolean;
};

// 20px, 1.5px strokes, currentColor. Hand-drawn rather than a dependency —
// four shapes is not a reason to install an icon set.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const DESTINATIONS: Destination[] = [
  {
    href: '/today',
    label: 'Today',
    built: true,
    // A day, marked.
    icon: (
      <Icon>
        <rect x="3" y="4" width="14" height="13" rx="2.5" />
        <path d="M3 8h14M7 2.5v3M13 2.5v3" />
        <circle cx="10" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    built: false,
    // A week grid.
    icon: (
      <Icon>
        <rect x="3" y="4" width="14" height="13" rx="2.5" />
        <path d="M3 8h14M8.5 8v9M13 8v9" />
      </Icon>
    ),
  },
  {
    href: '/notes',
    label: 'Notes',
    built: false,
    // A page with writing on it.
    icon: (
      <Icon>
        <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
        <path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h3" />
      </Icon>
    ),
  },
  {
    href: '/review',
    label: 'Review',
    built: false,
    // Something that came back around.
    icon: (
      <Icon>
        <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
        <path d="M16.8 3v3.2h-3.2" />
      </Icon>
    ),
  },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Laptop. 216px, surface, one hairline down the right. */}
      <nav
        aria-label="Sections"
        className={cx(
          'hidden shrink-0 flex-col gap-1 border-r border-border bg-surface md:flex',
          'w-(--sidebar-width) px-(--sidebar-pad-inline) py-(--sidebar-pad-block)'
        )}
      >
        <p className="px-2 pb-4 font-mono text-label text-faint uppercase">Recalc</p>

        {DESTINATIONS.map((destination) => {
          const current = isCurrent(pathname, destination.href);
          return (
            <Link
              key={destination.href}
              href={destination.href}
              aria-current={current ? 'page' : undefined}
              className={cx(
                'flex h-(--control-height) items-center gap-3 rounded-card px-2',
                'text-14 transition-colors duration-100',
                current
                  ? 'bg-sunken font-medium text-ink'
                  : 'text-muted hover:bg-sunken hover:text-ink'
              )}
            >
              {destination.icon}
              <span className="truncate">{destination.label}</span>
              {destination.built ? null : (
                <span className="ml-auto font-mono text-label text-faint uppercase">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Phone. Fixed to the bottom, 62px, one hairline along the top, and
          padded for the home indicator so the labels are not sitting on it. */}
      <nav
        aria-label="Sections"
        className={cx(
          'fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface md:hidden',
          'h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]'
        )}
      >
        {DESTINATIONS.map((destination) => {
          const current = isCurrent(pathname, destination.href);
          return (
            <Link
              key={destination.href}
              href={destination.href}
              aria-current={current ? 'page' : undefined}
              className={cx(
                'flex flex-col items-center justify-center gap-1',
                'text-12 transition-colors duration-100',
                current ? 'font-medium text-ink' : 'text-faint'
              )}
            >
              {destination.icon}
              <span>{destination.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
