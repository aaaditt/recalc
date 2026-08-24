// The seven-day strip across the top of the day view.
//
// docs/DESIGN.md: "seven days, current day marked, dots under days that have
// classes", and in Measurements: "selected day a 34px dark filled circle".
//
// The dots are course colours rather than a single flat mark, so the strip
// answers "which subjects am I in that day" at a glance and stays inside the
// rule that colour means one thing here. See docs/DECISIONS.md.

import { courseDot } from '@/lib/course-colours';
import { dayNumber, weekdayShort, type CalendarMeeting } from '@/lib/calendar';
import type { CalendarDate } from '@/lib/time';
import { cx } from '@/lib/cx';

/** At most this many dots under a day; more would be a smear, not a signal. */
const MAX_DOTS = 4;

export function DateStrip({
  dates,
  selected,
  today,
  meetingsByDate,
  onSelect,
}: {
  dates: CalendarDate[];
  selected: CalendarDate;
  today: CalendarDate;
  meetingsByDate: ReadonlyMap<CalendarDate, CalendarMeeting[]>;
  onSelect: (date: CalendarDate) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {dates.map((date) => {
        const dayMeetings = meetingsByDate.get(date) ?? [];
        const isSelected = date === selected;

        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            aria-current={isSelected ? 'date' : undefined}
            className="flex min-w-0 flex-col items-center gap-1 rounded-card py-2 transition-colors duration-100 hover:bg-sunken"
          >
            <span
              className={cx(
                'font-mono text-label uppercase',
                date === today ? 'text-accent' : 'text-faint'
              )}
            >
              {weekdayShort(date)}
            </span>

            <span
              className={cx(
                'flex items-center justify-center rounded-full text-14',
                isSelected ? 'bg-ink font-medium text-bg' : 'text-ink'
              )}
              style={{
                width: 'var(--strip-selected-size)',
                height: 'var(--strip-selected-size)',
              }}
            >
              {dayNumber(date)}
            </span>

            {/* Fixed height whether or not there are dots, so the numbers
                across the strip never jump by a row. */}
            <span
              className="flex items-center justify-center gap-1"
              style={{ height: 'var(--strip-dot-size)' }}
            >
              {dayMeetings.slice(0, MAX_DOTS).map((meeting) => (
                <span
                  key={meeting.id}
                  style={{
                    ...courseDot(meeting.colour),
                    width: 'var(--strip-dot-size)',
                    height: 'var(--strip-dot-size)',
                    opacity: meeting.cancelled ? 0.5 : undefined,
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
