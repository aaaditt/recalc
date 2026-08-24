// The month view — deadlines, not lectures.
//
// docs/DESIGN.md: "For seeing shape and pressure, not detail. Each day cell:
// small course-colour dots for its classes, and a count badge for deadlines.
// No text inside cells beyond the date and the badge."
//
// So there is deliberately no class name anywhere on this screen. Tapping a
// day opens the day view, which is where detail belongs.

import { courseDot } from '@/lib/course-colours';
import {
  dayNumber,
  monthGrid,
  sameMonth,
  weekdayShort,
  type CalendarDeadline,
  type CalendarMeeting,
} from '@/lib/calendar';
import type { CalendarDate } from '@/lib/time';
import { cx } from '@/lib/cx';

/** More dots than this in one cell is a smear rather than a signal. */
const MAX_DOTS = 6;

export function MonthView({
  anchor,
  today,
  meetingsByDate,
  deadlinesByDate,
  onSelect,
}: {
  anchor: CalendarDate;
  today: CalendarDate;
  meetingsByDate: ReadonlyMap<CalendarDate, CalendarMeeting[]>;
  deadlinesByDate: ReadonlyMap<CalendarDate, CalendarDeadline[]>;
  onSelect: (date: CalendarDate) => void;
}) {
  const weeks = monthGrid(anchor);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {weeks[0].map((date) => (
          <div
            key={date}
            className="px-2 py-2 text-center font-mono text-label text-faint uppercase"
          >
            {weekdayShort(date)}
          </div>
        ))}
      </div>

      {weeks.map((week, index) => (
        <div key={week[0]} className={cx('grid grid-cols-7', index > 0 && 'border-t border-line')}>
          {week.map((date) => {
            const dayMeetings = meetingsByDate.get(date) ?? [];
            const dayDeadlines = deadlinesByDate.get(date) ?? [];
            const inMonth = sameMonth(date, anchor);

            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                aria-label={date}
                className={cx(
                  'relative flex min-w-0 flex-col items-center gap-2 border-l border-line px-1 pt-2 first:border-l-0',
                  'transition-colors duration-100 hover:bg-sunken',
                  !inMonth && 'opacity-40'
                )}
                style={{
                  height: 'var(--month-cell-height)',
                  ...(date === today ? { backgroundColor: 'var(--today-tint)' } : null),
                }}
              >
                <span
                  className={cx(
                    'flex items-center justify-center rounded-full text-12',
                    date === today ? 'bg-ink font-medium text-bg' : 'text-ink'
                  )}
                  style={{
                    width: 'var(--month-date-size)',
                    height: 'var(--month-date-size)',
                  }}
                >
                  {dayNumber(date)}
                </span>

                <span className="flex max-w-full flex-wrap items-center justify-center gap-1">
                  {dayMeetings.slice(0, MAX_DOTS).map((meeting) => (
                    <span
                      key={meeting.id}
                      style={{
                        ...courseDot(meeting.colour),
                        width: 'var(--month-dot-size)',
                        height: 'var(--month-dot-size)',
                        opacity: meeting.cancelled ? 0.5 : undefined,
                      }}
                    />
                  ))}
                </span>

                {/* The one thing on this screen allowed to be the accent: a
                    deadline is something that needs attention. */}
                {dayDeadlines.length > 0 ? (
                  <span className="absolute top-1 right-1 rounded-full bg-accent-bg px-2 text-label font-medium text-accent">
                    {dayDeadlines.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
