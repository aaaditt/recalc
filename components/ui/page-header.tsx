import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

// The title block at the top of a page. Not the 56px top bar — that is chrome
// and arrives with the app shell.
//
// Slice 26 gave it two things it was missing.
//
// One: it stacks on a phone. `actions` used to sit beside the title with
// `shrink-0`, so a screen with three of them squeezed its own heading down to
// an ellipsis at 390px — on the device docs/DESIGN.md says the app has to work
// one-handed on.
//
// Two: `actions` now means actions. Before this slice it was also where every
// screen put its "go somewhere else" links, because the nav was full at six and
// there was nowhere else to put them (docs/DECISIONS.md, six times). The nav
// holds those now, so a button here is something that happens on this page.

type PageHeaderProps = {
  title: ReactNode;
  /** A date, a course code, a count. One line. */
  subtitle?: ReactNode;
  /** Things that DO something on this page. Not links to other screens. */
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cx(
        'flex flex-col gap-3 pb-5',
        'sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-26 font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-14 text-muted">{subtitle}</p> : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
