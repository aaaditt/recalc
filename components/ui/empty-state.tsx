import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

// What a list says when it has nothing in it.
//
// Quiet — an empty day is a fact, not a problem, and nothing in here is styled
// as an error. But it is not *nothing*: an empty screen is the one moment the
// app has the reader's full attention and no content competing for it, so the
// title says what is true and the action says what to do about it.
//
// Slice 26 gave it a measured column and a real hierarchy. It was three
// centred paragraphs at the same weight, which is what an unfinished screen
// looks like. The description now sits at a fixed measure so the line breaks
// are the same on every screen that uses it, rather than depending on how wide
// the card it landed in happens to be.

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center px-6 py-14 text-center',
        className
      )}
    >
      <p className="text-16 font-medium text-balance">{title}</p>

      {description ? (
        <p className="mt-2 max-w-[38ch] text-14 leading-6 text-muted text-pretty">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
