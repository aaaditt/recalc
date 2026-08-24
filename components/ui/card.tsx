import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

// A surface with a hairline and a 6px radius. No padding on purpose: the
// caller decides, and a default would only be something to fight with.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-card border border-border bg-surface', className)}
      {...props}
    />
  );
}

/** The 1px rule between rows inside a card. Lighter than the card's own edge. */
export function CardDivider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx('border-0 border-t border-line', className)} {...props} />;
}
