import { cx } from '@/lib/cx';

// The one-tap complete.
//
// A plain <form> around a plain <button>, which means it is a Server Component
// and works with no JavaScript at all — completing a task from /today is the
// interaction prompts/06-tasks.md is strictest about, so it is the one with the
// fewest moving parts.

type TaskCheckProps = {
  id: string;
  done: boolean;
  title: string;
  /** Server action: reads `id` and `done` off the form. */
  toggle: (formData: FormData) => Promise<void>;
};

export function TaskCheck({ id, done, title, toggle }: TaskCheckProps) {
  return (
    <form action={toggle} className="flex shrink-0 items-center">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="done" value={done ? 'false' : 'true'} />
      <button
        type="submit"
        aria-pressed={done}
        aria-label={done ? `Reopen ${title}` : `Complete ${title}`}
        title={done ? 'Reopen' : 'Complete'}
        // 44px of tappable area around an 18px box: the box is what DESIGN.md's
        // hairline aesthetic wants, the padding is its tap-target rule.
        className="-m-2 flex h-(--control-height) w-(--control-height) items-center justify-center"
      >
        <span
          className={cx(
            'flex size-(--check-size) items-center justify-center rounded-full border transition-colors duration-100',
            done ? 'border-ok bg-ok-bg text-ok' : 'border-border text-transparent hover:border-ink'
          )}
        >
          <svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 6.5 4.5 9 10 3" />
          </svg>
        </span>
      </button>
    </form>
  );
}
