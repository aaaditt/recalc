import Link from 'next/link';

import { Card } from '@/components/ui/card';
import type { Hint } from '@/modules/hints';

// One hint, as one line. Slice 21.
//
// The shape is `components/today/setup-agents.tsx`'s, on purpose: this app has
// exactly one way of saying something quietly, and a second one would be a
// second thing to notice. Neutrals, no accent — docs/DESIGN.md reserves the
// accent for "something needs attention", and a feature you have not met yet is
// not an alarm.
//
// Presentational. It does not know when to appear; `modules/hints` decided that
// from data the screen already had, and a component that could decide for itself
// is a component that could disagree.
//
// Two things it must do and does:
//
//   * Always be dismissible. A hint you cannot silence is an advert.
//   * Never look like an error. It sits in the page flow rather than over it,
//     and nothing about it blocks what you came to the screen to do.

export function HintLine({
  hint,
  dismiss,
}: {
  hint: Hint;
  /** Bound to this hint's id by the page. Puts it away for good. */
  dismiss: () => Promise<void>;
}) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <p className="min-w-0 flex-1 text-14 text-muted">{hint.text}</p>

      <div className="flex shrink-0 items-center gap-4">
        {/* Only when there is somewhere to go. A hint about the box directly
            below it has nowhere to send anybody, and a link that goes to the
            screen you are already on is furniture. */}
        {hint.href && hint.cta ? (
          <Link
            href={hint.href}
            className="text-14 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
          >
            {hint.cta}
          </Link>
        ) : null}
        <form action={dismiss}>
          <button
            type="submit"
            aria-label="Dismiss this tip"
            className="text-13 text-faint underline underline-offset-4 transition-colors duration-100 hover:text-ink"
          >
            Dismiss
          </button>
        </form>
      </div>
    </Card>
  );
}
