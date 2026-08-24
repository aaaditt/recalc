// One lecture in today's list.
//
// The class-block treatment from docs/DESIGN.md: a 3px rail in the course
// colour, the same colour at 8% behind it, and every word in --text or
// --text-muted. Never the course colour, never a saturated fill.
//
// Presentational: it is handed strings and a state, and it knows nothing about
// where they came from.

import { Pill } from '@/components/ui/pill';
import { courseRail, courseTint, type CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';
import type { ClassState } from '@/lib/today';

type ClassRowProps = {
  /** 'HH:MM', in the user's timezone. */
  startsAt: string;
  endsAt: string;
  /** 'ME301'. */
  code: string;
  name: string;
  room: string | null;
  colour: CourseColour;
  state: ClassState;
  cancelled: boolean;
};

export function ClassRow({
  startsAt,
  endsAt,
  code,
  name,
  room,
  colour,
  state,
  cancelled,
}: ClassRowProps) {
  // A finished class recedes; a cancelled one recedes to the .5 docs/DESIGN.md
  // asks for and is struck through, because knowing a class was cancelled
  // beats it vanishing.
  const dimmed = cancelled ? 'opacity-50' : state === 'past' ? 'opacity-60' : null;

  // The one class that matters right now. A hairline around the block, and the
  // name in medium — the rail stays the course's, and no extra colour is
  // spent, because colour here means "which course" and nothing else.
  const highlighted = state === 'now' || state === 'next';

  return (
    <li className={cx('flex items-stretch gap-3', dimmed)}>
      {/* The time gutter, echoing the calendar: mono, right-aligned. */}
      <div className="w-12 shrink-0 pt-3 text-right font-mono text-12 leading-tight">
        <div className={cx(cancelled && 'line-through', highlighted && 'font-medium')}>
          {startsAt}
        </div>
        <div className="text-faint">{endsAt}</div>
      </div>

      <div
        className={cx(
          'min-w-0 flex-1 rounded-block p-3',
          // The inline rail wins on the left edge, so this is a hairline on
          // the other three sides.
          highlighted && 'border border-border'
        )}
        style={{ ...courseTint(colour), ...courseRail(colour) }}
      >
        <div className="flex items-center gap-2">
          <span className={cx('font-mono text-12 font-medium', cancelled && 'line-through')}>
            {code}
          </span>
          {state === 'now' ? <Pill tone="accent">Now</Pill> : null}
          {state === 'next' ? <Pill>Next</Pill> : null}
          {cancelled ? <Pill>Cancelled</Pill> : null}
        </div>

        <p
          className={cx(
            'truncate text-16',
            highlighted && 'font-medium',
            cancelled && 'line-through'
          )}
        >
          {name}
        </p>

        {room ? <p className="truncate text-13 text-muted">{room}</p> : null}
      </div>
    </li>
  );
}
