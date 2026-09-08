'use client';

// The app's only chrome: a 216px sidebar on a laptop, a 62px bar at the bottom
// of a phone.
//
// Slice 26 rebuilt it, and the reason is written six separate times in
// docs/DECISIONS.md: "the nav is full at six". It was a flat list of six
// destinations in an app that had grown to thirteen, so Friends, Bands,
// Courses, Timetable, Focus, Questions and Inbox were each reached by a 13px
// text link buried in some other screen's header. Six of those complaints were
// filed and none of them was the real problem — the real problem was that a
// flat list has no room to grow and a grouped one does.
//
// So: three groups of four, named for the question they answer.
//
//   Day       what am I doing between now and bedtime
//   Study     the work itself, and what has gone out of date
//   Semester  the shape of the term, and who else is in it
//
// A phone gets the four most-opened plus More, which is the same grouped list
// in a sheet. There is no seventh-slot problem any more, at any width.
//
// 'use client' for two reasons: knowing which link is the current page, and
// opening More. Everything else here is markup.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Sheet } from '@/components/ui/sheet';
import { cx } from '@/lib/cx';

type Destination = {
  href: string;
  label: string;
  icon: ReactNode;
};

type Group = {
  /** The question this group answers. Shown on the sidebar and in More. */
  title: string;
  items: Destination[];
};

// 20px, 1.5px strokes, currentColor. Hand-drawn rather than a dependency —
// thirteen shapes is still not a reason to install an icon set, and every one
// of them is a thing in this app rather than a generic glyph.
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

const GROUPS: Group[] = [
  {
    title: 'Day',
    items: [
      {
        href: '/today',
        label: 'Today',
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
        // A week grid.
        icon: (
          <Icon>
            <rect x="3" y="4" width="14" height="13" rx="2.5" />
            <path d="M3 8h14M8.5 8v9M13 8v9" />
          </Icon>
        ),
      },
      {
        href: '/tasks',
        label: 'Tasks',
        // A list with one thing ticked off.
        icon: (
          <Icon>
            <path d="M8.5 5.5h8M8.5 10h8M8.5 14.5h5" />
            <path d="M3 5.5 4.25 6.75 6.5 4.25" />
            <path d="M3.25 10h2M3.25 14.5h2" />
          </Icon>
        ),
      },
      {
        href: '/focus',
        label: 'Focus',
        // A timer, part-run.
        icon: (
          <Icon>
            <circle cx="10" cy="11" r="6.5" />
            <path d="M10 7.5V11h2.5M7.5 2.5h5" />
          </Icon>
        ),
      },
    ],
  },
  {
    title: 'Study',
    items: [
      {
        href: '/notes',
        label: 'Notes',
        // A page with writing on it.
        icon: (
          <Icon>
            <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
            <path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h3" />
          </Icon>
        ),
      },
      {
        href: '/questions',
        label: 'Questions',
        // Something asked and left open.
        icon: (
          <Icon>
            <path d="M3.5 4.5h13v9.5h-7L6 17.5V14H3.5z" />
            <path d="M8.3 8a1.8 1.8 0 1 1 2.2 1.9v1.1" />
            <circle cx="10.5" cy="12.6" r=".7" fill="currentColor" stroke="none" />
          </Icon>
        ),
      },
      {
        href: '/review',
        label: 'Review',
        // Something that came back around.
        icon: (
          <Icon>
            <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
            <path d="M16.8 3v3.2h-3.2" />
          </Icon>
        ),
      },
      {
        href: '/search',
        label: 'Search',
        // A lens.
        icon: (
          <Icon>
            <circle cx="8.75" cy="8.75" r="5.25" />
            <path d="M12.6 12.6 17 17" />
          </Icon>
        ),
      },
    ],
  },
  {
    title: 'Semester',
    items: [
      {
        href: '/courses',
        label: 'Courses',
        // A book, open.
        icon: (
          <Icon>
            <path d="M10 5.5v11" />
            <path d="M10 5.5C8.6 4.4 6.9 3.9 4.5 4v10.5c2.4-.1 4.1.4 5.5 1.5" />
            <path d="M10 5.5c1.4-1.1 3.1-1.6 5.5-1.5v10.5c-2.4-.1-4.1.4-5.5 1.5" />
          </Icon>
        ),
      },
      {
        href: '/timetable',
        label: 'Timetable',
        // Rows and columns — the printed sheet, not a calendar.
        icon: (
          <Icon>
            <rect x="3" y="3.5" width="14" height="13" rx="2" />
            <path d="M3 8h14M3 12h14M8 3.5v13" />
          </Icon>
        ),
      },
      {
        href: '/bands',
        label: 'Bands',
        // Stretches of a day, stacked. Slice 25.
        icon: (
          <Icon>
            <rect x="3" y="3.5" width="14" height="5" rx="1.8" />
            <rect x="3" y="11.5" width="8.5" height="5" rx="1.8" />
          </Icon>
        ),
      },
      {
        href: '/friends',
        label: 'Friends',
        // Two people. Beside Timetable on purpose: slice 23's whole job is
        // putting a friend's week next to yours.
        icon: (
          <Icon>
            <circle cx="7.75" cy="7" r="2.75" />
            <path d="M3 16.5c0-2.6 2.1-4.25 4.75-4.25s4.75 1.65 4.75 4.25" />
            <path d="M13.25 5.6a2.6 2.6 0 0 1 0 5M14 12.5c1.9.35 3 1.75 3 4" />
          </Icon>
        ),
      },
    ],
  },
];

/** Reached from the foot of the sidebar and the bottom of More. */
const INBOX: Destination = {
  href: '/inbox',
  label: 'Inbox',
  // A tray with something arriving in it.
  icon: (
    <Icon>
      <path d="M3 11.5h4l1 2h4l1-2h4" />
      <path d="M3 11.5 5 4.5h10l2 7v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </Icon>
  ),
};

const ALL: Destination[] = [...GROUPS.flatMap((group) => group.items), INBOX];

/** The four a phone gets its own slot for. The rest live behind More. */
const PHONE_HREFS = ['/today', '/calendar', '/tasks', '/notes'];
const PHONE: Destination[] = PHONE_HREFS.map(
  (href) => ALL.find((item) => item.href === href)!
);

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * How many things are waiting in /review.
 *
 * prompts/11-recalc-engine.md calls this "the number that makes me open the
 * app", so it is the one piece of chrome that carries the accent — which
 * docs/DESIGN.md reserves for "something needs attention" and nothing else.
 * Zero draws nothing at all: a badge that is always there stops being a signal.
 */
function StaleBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;

  return (
    <span
      aria-label={`${count} waiting in review`}
      className={cx(
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5',
        'bg-accent-bg font-mono text-label font-medium text-accent tabular-nums',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * One row, in the sidebar or in More.
 *
 * The icon carries the state as much as the label does: `--text` when you are
 * here, `--text-faint` when you are not. That is the whole of the hierarchy and
 * it costs nothing — a row that only changed its background read as a hover
 * state that had got stuck.
 */
function NavRow({
  destination,
  current,
  badge,
  onNavigate,
}: {
  destination: Destination;
  current: boolean;
  badge: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={destination.href}
      aria-current={current ? 'page' : undefined}
      onClick={onNavigate}
      className={cx(
        'group flex h-(--control-height) items-center gap-3 rounded-card px-2',
        'text-14 transition-colors duration-(--duration-tap)',
        'focus-visible:outline-(length:--focus-ring-width) focus-visible:-outline-offset-1 focus-visible:outline-accent',
        current
          ? 'bg-sunken font-medium text-ink'
          : 'text-muted hover:bg-sunken hover:text-ink'
      )}
    >
      <span
        className={cx(
          'transition-colors duration-(--duration-tap)',
          current ? 'text-ink' : 'text-faint group-hover:text-muted'
        )}
      >
        {destination.icon}
      </span>
      <span className="truncate">{destination.label}</span>
      <StaleBadge count={badge} className="ml-auto" />
    </Link>
  );
}

type AppNavProps = {
  /** Stale derivations waiting in /review. Read by the shell, never here. */
  staleCount?: number;
  /**
   * The signed-in username, for the account row at the foot of the sidebar.
   *
   * Slice 24. Absent means the row is not drawn, which is the state during the
   * one render between signing in and claiming a name.
   */
  username?: string | null;
};

export function AppNav({ staleCount = 0, username = null }: AppNavProps) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const badgeFor = (href: string) => (href === '/review' ? staleCount : 0);

  // The phone's More slot lights up when the page you are on lives behind it,
  // so the bar never claims you are nowhere.
  const inMore = !PHONE_HREFS.some((href) => isCurrent(pathname, href));

  const settingsRow = username ? (
    <Link
      href="/settings"
      aria-current={isCurrent(pathname, '/settings') ? 'page' : undefined}
      onClick={() => setMore(false)}
      className={cx(
        'flex h-(--control-height) items-center gap-2 rounded-card px-2',
        'transition-colors duration-(--duration-tap)',
        'focus-visible:outline-(length:--focus-ring-width) focus-visible:-outline-offset-1 focus-visible:outline-accent',
        isCurrent(pathname, '/settings')
          ? 'bg-sunken font-medium text-ink'
          : 'text-muted hover:bg-sunken hover:text-ink'
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-13">@{username}</span>
      <span aria-hidden className="shrink-0 text-12 text-faint">
        Settings
      </span>
    </Link>
  ) : null;

  return (
    <>
      {/* Laptop. 216px, surface, one hairline down the right.
          
          Sticky and exactly one viewport tall, which it was not before slice
          26: the column stretched to whatever the page was, so on any screen
          longer than the window — /today with a week of deadlines, /notes with
          a list — the foot of the nav sat below the fold and Inbox and the
          account row were unreachable without scrolling the *page* to find the
          navigation. The list scrolls inside itself instead. */}
      <nav
        aria-label="Sections"
        className={cx(
          'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-surface md:flex',
          'w-(--sidebar-width) px-(--sidebar-pad-inline) py-(--sidebar-pad-block)'
        )}
      >
        <p className="px-2 pb-4 font-mono text-label text-faint uppercase">Recalc</p>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {GROUPS.map((group) => (
            <div key={group.title} className="pb-4">
              <p className="px-2 pb-1 font-mono text-label text-faint uppercase">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((destination) => (
                  <NavRow
                    key={destination.href}
                    destination={destination}
                    current={isCurrent(pathname, destination.href)}
                    badge={badgeFor(destination.href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* The foot: what has arrived, and who you are. Separated by a hairline
            rather than by a fourth group label, because neither of these is a
            place you go to work — they are the edges of the app. */}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
          <NavRow
            destination={INBOX}
            current={isCurrent(pathname, INBOX.href)}
            badge={0}
          />
          {settingsRow}
        </div>
      </nav>

      {/* Phone. Fixed to the bottom, 62px, one hairline along the top, and
          padded for the home indicator so the labels are not sitting on it.
          Four destinations and More since slice 26 — five columns at 390px is
          78px each, comfortably past the 44px tap target, and there is no
          longer a limit to run into because More holds everything. */}
      <nav
        aria-label="Sections"
        className={cx(
          'fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface md:hidden',
          'h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]'
        )}
      >
        {PHONE.map((destination) => {
          const current = isCurrent(pathname, destination.href);
          return (
            <Link
              key={destination.href}
              href={destination.href}
              aria-current={current ? 'page' : undefined}
              className={cx(
                'flex flex-col items-center justify-center gap-1',
                'text-12 transition-colors duration-(--duration-tap)',
                'active:translate-y-(--press-shift)',
                current ? 'font-medium text-ink' : 'text-faint'
              )}
            >
              {/* The badge sits on the icon's top-right corner: a phone column
                  has no room for a number beside the label. */}
              <span className="relative">
                {destination.icon}
                <StaleBadge
                  count={badgeFor(destination.href)}
                  className="absolute -top-1 -right-2.5"
                />
              </span>
              <span>{destination.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          aria-expanded={more}
          className={cx(
            'flex flex-col items-center justify-center gap-1',
            'text-12 transition-colors duration-(--duration-tap)',
            'active:translate-y-(--press-shift)',
            inMore ? 'font-medium text-ink' : 'text-faint'
          )}
        >
          <span className="relative">
            <Icon>
              <circle cx="4.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
            </Icon>
            {/* Anything waiting behind More says so on More, or the badge would
                be invisible on a phone whenever /review is not one of the four. */}
            <StaleBadge count={staleCount} className="absolute -top-1 -right-2.5" />
          </span>
          <span>More</span>
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Go to">
        <div className="flex flex-col">
          {GROUPS.map((group) => (
            <div key={group.title} className="pb-4">
              <p className="px-2 pb-1 font-mono text-label text-faint uppercase">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((destination) => (
                  <NavRow
                    key={destination.href}
                    destination={destination}
                    current={isCurrent(pathname, destination.href)}
                    badge={badgeFor(destination.href)}
                    onNavigate={() => setMore(false)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-0.5 border-t border-line pt-2">
            <NavRow
              destination={INBOX}
              current={isCurrent(pathname, INBOX.href)}
              badge={0}
              onNavigate={() => setMore(false)}
            />
            {settingsRow}
          </div>
        </div>
      </Sheet>
    </>
  );
}
