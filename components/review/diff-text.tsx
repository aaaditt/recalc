import type { DiffPart } from '@/lib/diff';
import { cx } from '@/lib/cx';

// What changed, drawn.
//
// Presentational only: it takes parts that lib/diff.ts already worked out and
// renders them. Removed words are struck through and additions underlined as
// well as coloured, because colour alone is not a signal — this has to be
// readable to someone who cannot tell the accent from the ok green, and on a
// phone in daylight.
//
// Only two colours are used and both are tokens: `--accent` for what went, and
// `--ok` for what arrived. docs/DESIGN.md reserves the accent for "something
// needs attention", which a stale source is precisely.

export function DiffText({ parts, className }: { parts: DiffPart[]; className?: string }) {
  if (parts.length === 0) return null;

  return (
    <p className={cx('text-14 leading-relaxed whitespace-pre-wrap', className)}>
      {parts.map((part, index) => {
        if (part.type === 'same') {
          return <span key={index}>{part.text}</span>;
        }

        const removed = part.type === 'removed';
        return (
          <span
            key={index}
            className={
              removed
                ? 'bg-accent-bg text-accent line-through'
                : 'bg-ok-bg text-ok underline underline-offset-2'
            }
          >
            {part.text}
          </span>
        );
      })}
    </p>
  );
}
