import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

// The title block at the top of a page. Not the 56px top bar — that is chrome
// and arrives with the app shell.
type PageHeaderProps = {
  title: ReactNode;
  /** A date, a course code, a count. One line. */
  subtitle?: ReactNode;
  /** Buttons, aligned to the right of the title on desktop. */
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cx('flex items-start justify-between gap-4 pb-4', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-26 font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-14 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
