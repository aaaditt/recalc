import Link from 'next/link';

import { Card, CardDivider } from '@/components/ui/card';
import { cx } from '@/lib/cx';
import type { Step, StepState } from '@/modules/onboarding';

// One step of the guided path, and the rail that says where it sits.
//
// Presentational, like every other component in this project: steps and strings
// in, no data fetching, no decision about whether anything is done —
// `modules/onboarding` works that out from real data.
//
// docs/DESIGN.md's neutrals throughout, and no accent anywhere. The accent means
// "something needs attention", and not having written a note yet is not an
// alarm. `--ok` on a finished step is the one colour here, and it is the same
// green tick the card this replaces used.
//
// One step on the screen at a time. The whole checklist would be more efficient
// and less welcoming, and welcoming is this screen's entire job.
//
// **Skipping is a link, not a write.** "Skip this" goes to `/start?step=<next>`,
// so which step you are looking at lives in the URL and nothing about it is
// stored. That keeps "progress is derived, never stored" true without an
// exception, makes the back button work, and means a skipped step comes back on
// its own the moment you return — which is what "every step can be returned to"
// has to mean when nothing is recorded.

/**
 * The progress rail: one segment per step, filled up to where you are.
 *
 * Not a percentage and not "3 of 7" in large type. A row of segments is read at
 * a glance and does not invite arithmetic about how much is left.
 */
function Rail({ steps, currentId }: { steps: Step[]; currentId: string | null }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Setup progress">
      {steps.map((step) => (
        <li
          key={step.id}
          aria-current={step.id === currentId ? 'step' : undefined}
          title={step.title}
          className={cx(
            'h-1 flex-1 rounded-full transition-colors duration-100',
            step.state === 'done'
              ? 'bg-ok'
              : step.id === currentId
                ? 'bg-ink'
                : 'bg-sunken'
          )}
        />
      ))}
    </ol>
  );
}

export function GuidedStep({
  steps,
  current,
  next,
  skipHref,
  showActTwoPreamble,
  actTwoPreamble,
  dismiss,
}: {
  steps: Step[];
  /** The step being shown. Null when every step is done. */
  current: Step | null;
  /** The one after it, named rather than numbered — knowing what is coming is
      what makes a sequence feel short. */
  next: Step | null;
  /** Where "Skip this" goes. Null on the last step, which has nothing after it. */
  skipHref: string | null;
  showActTwoPreamble: boolean;
  actTwoPreamble: string;
  /** Puts the path away for this account. The only thing here that writes. */
  dismiss: () => Promise<void>;
}) {
  const position = current
    ? `Step ${steps.findIndex((step) => step.id === current.id) + 1} of ${steps.length}`
    : 'All done';

  if (!current) {
    return (
      <Card>
        <div className="px-4 py-5">
          <Rail steps={steps} currentId={null} />
          <p className="pt-4 text-16 font-medium">That is the whole thing.</p>
          <p className="pt-1 text-14 text-muted">
            Your semester is in, and you have watched a summary notice that its source
            changed. Everything else in Recalc explains itself when it becomes useful.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Link
              href="/today"
              className="text-14 font-medium underline underline-offset-4"
            >
              Go to today
            </Link>
            <form action={dismiss}>
              <button
                type="submit"
                className="text-13 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
              >
                Don&rsquo;t show this again
              </button>
            </form>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-4 pt-4">
        <Rail steps={steps} currentId={current.id} />
        <p className="pt-3 font-mono text-label text-faint uppercase">{position}</p>
      </div>

      {showActTwoPreamble ? (
        <p className="px-4 pt-3 text-13 text-muted">{actTwoPreamble}</p>
      ) : null}

      <div className="px-4 pt-3 pb-4">
        <h2 className="text-20 font-semibold tracking-tight">{current.title}</h2>
        <p className="pt-1 text-14 text-muted">{current.why}</p>

        <div className="flex flex-wrap items-center gap-4 pt-4">
          {current.state === 'blocked' ? (
            // No dead button. A blocked step says what is missing and offers the
            // one thing that would unblock it.
            <p className="text-14">
              This one needs a model first —{' '}
              <Link href="/settings/agents" className="underline underline-offset-4">
                add a key
              </Link>{' '}
              and come back.
            </p>
          ) : (
            <Link
              href={current.href}
              className="inline-flex h-(--control-height) items-center justify-center rounded-card bg-ink px-(--control-padding-x) text-14 font-medium whitespace-nowrap text-bg transition-opacity duration-100 hover:opacity-90"
            >
              {current.cta}
            </Link>
          )}

          {skipHref ? (
            <Link
              href={skipHref}
              className="text-13 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
            >
              Skip this
            </Link>
          ) : null}
        </div>
      </div>

      {next ? (
        <>
          <CardDivider />
          <p className="px-4 py-3 text-13 text-muted">
            Next: <span className="text-ink">{next.title}</span>
          </p>
        </>
      ) : null}
    </Card>
  );
}

/**
 * Every step, listed quietly under the current one.
 *
 * One step at a time is a rule about *attention*, not about information. A
 * person in the middle of this should be able to look at what they are in the
 * middle of, without the screen putting seven things in front of them at once.
 */
export function StepList({
  steps,
  currentId,
}: {
  steps: Step[];
  currentId: string | null;
}) {
  const label: Record<StepState, string> = {
    done: 'Done',
    todo: '',
    blocked: 'Needs a model',
  };

  return (
    <ol className="flex flex-col gap-1">
      {steps.map((step, index) => (
        <li key={step.id}>
          <Link
            href={`/start?step=${step.id}`}
            className={cx(
              'flex items-center gap-3 rounded-card px-2 py-1 text-13 transition-colors duration-100 hover:bg-sunken',
              step.id === currentId ? 'text-ink' : 'text-faint'
            )}
          >
            <span
              aria-hidden
              className={cx(
                'flex h-(--check-size) w-(--check-size) shrink-0 items-center justify-center rounded-full text-12',
                step.state === 'done' ? 'bg-ok-bg text-ok' : 'bg-sunken text-faint'
              )}
            >
              {step.state === 'done' ? '✓' : index + 1}
            </span>
            <span
              className={cx(
                'min-w-0 flex-1 truncate',
                step.state === 'done' ? 'line-through' : ''
              )}
            >
              {step.title}
            </span>
            {label[step.state] ? (
              <span className="shrink-0 font-mono text-label text-faint uppercase">
                {label[step.state]}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}
