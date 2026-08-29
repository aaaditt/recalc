import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { cx } from '@/lib/cx';

// What Aadit sees the first time he signs in, when the database is empty.
//
// Three steps, in the order they actually depend on each other, each ticked the
// moment the thing it asks for exists. It is not a wizard and it is not a modal
// — those are screens you have to finish before the app will let you in, and
// this app renders perfectly well empty. It is one card at the top of /today
// that disappears on its own.
//
// docs/DESIGN.md's neutrals are used throughout: no accent anywhere. The accent
// means "something needs attention", and having not yet typed a timetable in is
// not an alarm.
//
// Presentational, like every other strip on this page: three booleans in, and
// no knowledge of where they came from.

type Step = {
  done: boolean;
  title: string;
  hint: string;
  href: string;
  cta: string;
};

export function FirstRun({
  termSet,
  hasCourses,
  hasClasses,
  dismiss,
}: {
  termSet: boolean;
  hasCourses: boolean;
  hasClasses: boolean;
  /** Hides the card for good. Everything else here is derived from real data. */
  dismiss: () => Promise<void>;
}) {
  const steps: Step[] = [
    {
      done: termSet,
      title: 'Say when term runs',
      hint: 'Two dates. Adding a class then knows how far to expand itself.',
      href: '/timetable',
      cta: 'Set the dates',
    },
    {
      done: hasCourses,
      title: 'Add your courses',
      hint: 'A code and a name each. Colours, instructors and credits can wait.',
      href: '/courses',
      cta: 'Add a course',
    },
    {
      done: hasClasses,
      title: 'Fill in your timetable',
      hint: 'Click the cell where a class sits and name it. The lectures follow.',
      href: '/timetable',
      cta: 'Open the grid',
    },
  ];

  // The first thing not yet done is the one worth pointing at.
  const next = steps.findIndex((step) => !step.done);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <p className="text-14 font-medium">Set up your semester</p>
        <form action={dismiss}>
          <button
            type="submit"
            className="text-12 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
          >
            Skip
          </button>
        </form>
      </div>

      <ol className="flex flex-col gap-2 px-4 pt-3 pb-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden
              className={cx(
                'mt-0.5 flex h-(--check-size) w-(--check-size) shrink-0 items-center justify-center rounded-full text-12',
                step.done ? 'bg-ok-bg text-ok' : 'bg-sunken text-faint'
              )}
            >
              {step.done ? '✓' : index + 1}
            </span>

            <span className="min-w-0 flex-1">
              <span
                className={cx('block text-14', step.done ? 'text-faint line-through' : '')}
              >
                {step.title}
              </span>
              {step.done ? null : (
                <span className="block text-12 text-muted">{step.hint}</span>
              )}
            </span>

            {index === next ? (
              <Link
                href={step.href}
                className="shrink-0 text-13 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
              >
                {step.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
