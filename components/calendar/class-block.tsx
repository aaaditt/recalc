// One class, drawn the way docs/DESIGN.md says a class is drawn:
//
//   3px left rail in the course colour
//   the same colour at 8% behind it
//   every word in --text / --text-muted, never in the course colour
//
// "Never fill a calendar block with a saturated course colour. Six saturated
// blocks is a fruit salad and it stops being scannable."
//
// Presentational. It is handed a meeting and how much room it has, and knows
// nothing about grids, drags or databases.

import type { CSSProperties } from 'react';

import { courseRail, courseTint } from '@/lib/course-colours';
import type { BlockDetail, CalendarMeeting } from '@/lib/calendar';
import { timeAt } from '@/lib/calendar';
import { cx } from '@/lib/cx';

type ClassBlockProps = {
  meeting: CalendarMeeting;
  detail: BlockDetail;
  timeZone: string;
  /** Shown while the block is being dragged, so the drop looks committed. */
  dragging?: boolean;
  className?: string;
};

export function ClassBlock({
  meeting,
  detail,
  timeZone,
  dragging = false,
  className,
}: ClassBlockProps) {
  // A cancelled class stays on the grid — knowing a class is cancelled is more
  // useful than it vanishing — at half opacity, with the tint dropped to 5%
  // and the code struck through.
  const style: CSSProperties = {
    ...courseTint(meeting.colour),
    ...courseRail(meeting.colour),
    padding: 'var(--block-pad-block) var(--block-pad-inline)',
    ...(meeting.cancelled
      ? ({ '--course-tint-alpha': 'var(--course-tint-alpha-cancelled)' } as CSSProperties)
      : null),
  };

  const struck = meeting.cancelled ? 'line-through' : null;

  return (
    <div
      style={style}
      className={cx(
        'flex h-full w-full flex-col overflow-hidden rounded-block text-left leading-tight',
        meeting.cancelled && 'opacity-50',
        dragging && 'shadow-float',
        className
      )}
    >
      {detail === 'tight' ? (
        <p className="flex min-w-0 items-baseline gap-2 truncate">
          <span className={cx('font-mono text-12 font-medium', struck)}>{meeting.code}</span>
          {meeting.room ? (
            <span className="truncate text-12 text-muted">{meeting.room}</span>
          ) : null}
        </p>
      ) : (
        <>
          <p className={cx('truncate font-mono text-12 font-medium', struck)}>
            {meeting.code}
            {meeting.cancelled ? <span className="ml-2 text-muted">cancelled</span> : null}
          </p>

          {detail === 'full' ? (
            <p className={cx('truncate text-12', struck)}>{meeting.name}</p>
          ) : null}

          <p className="truncate text-12 text-muted">
            {meeting.room ? `${meeting.room} · ` : ''}
            {timeAt(meeting.startsAt, timeZone)}
          </p>
        </>
      )}
    </div>
  );
}
