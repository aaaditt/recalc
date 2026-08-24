import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

// What a list says when it has nothing in it. Quiet — an empty day is a fact,
// not a problem.
type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx('flex flex-col items-center gap-2 px-4 py-12 text-center', className)}
    >
      <p className="text-16 font-medium">{title}</p>
      {description ? <p className="max-w-xs text-14 text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
