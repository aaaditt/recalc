// The day view — the default on a phone.
//
// docs/DESIGN.md: "A week grid at 390px is unreadable. Most student apps ship
// one anyway. We do not." So: a swipeable seven-day strip, then a vertical
// timeline with generous blocks, room and code legible without zooming.
//
// Measurements: hour row 72px, blocks inset 60px from the left (clearing the
// time labels) and 14px from the right.

import { ClassBlock } from '@/components/calendar/class-block';
import { DateStrip } from '@/components/calendar/date-strip';
import { DeadlineChip } from '@/components/calendar/deadline-chip';
import {
  blockDetail,
  formatHour,
  hoursIn,
  layoutDay,
  minutesInto,
  type CalendarDeadline,
  type CalendarMeeting,
  type HourRange,
} from '@/lib/calendar';
import type { CalendarDate } from '@/lib/time';
import { cx } from '@/lib/cx';

type DayViewProps = {
  date: CalendarDate;
  weekDates: CalendarDate[];
  today: CalendarDate;
  timeZone: string;
  hours: HourRange;
  meetingsByDate: ReadonlyMap<CalendarDate, CalendarMeeting[]>;
  deadlinesByDate: ReadonlyMap<CalendarDate, CalendarDeadline[]>;
  now: Date | null;
  onSelect: (date: CalendarDate) => void;
  onOpen: (meeting: CalendarMeeting) => void;
};

export function DayView({
  date,
  weekDates,
  today,
  timeZone,
  hours,
  meetingsByDate,
  deadlinesByDate,
  now,
  onSelect,
  onOpen,
}: DayViewProps) {
  const hourMarks = hoursIn(hours);
  const gridStartMinute = hours.startHour * 60;
  const gridMinutes = (hours.endHour - hours.startHour) * 60;

  const placed = layoutDay(meetingsByDate.get(date) ?? [], date, timeZone);
  const deadlines = deadlinesByDate.get(date) ?? [];

  const nowMinute = now && date === today ? minutesInto(now, date, timeZone) : null;
  const nowPercent =
    nowMinute === null || nowMinute < gridStartMinute || nowMinute > hours.endHour * 60
      ? null
      : ((nowMinute - gridStartMinute) / gridMinutes) * 100;

  return (
    <div className="flex flex-col gap-4">
      <DateStrip
        dates={weekDates}
        selected={date}
        today={today}
        meetingsByDate={meetingsByDate}
        onSelect={onSelect}
      />

      {deadlines.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-label text-faint uppercase">Due</span>
          {deadlines.map((deadline) => (
            <DeadlineChip key={deadline.id} deadline={deadline} timeZone={timeZone} />
          ))}
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-card border border-border bg-surface">
        {/* Hour rows, with the time label sitting on each line. */}
        {hourMarks.map((hour, index) => (
          <div
            key={hour}
            className={cx('h-(--day-hour-height)', index > 0 && 'border-t border-line')}
          >
            <span className="pl-4 font-mono text-12 text-faint">{formatHour(hour)}</span>
          </div>
        ))}

        {/* Blocks, clear of the time labels. */}
        <div
          className="absolute inset-y-0"
          style={{
            left: 'var(--day-block-inset-start)',
            right: 'var(--day-block-inset-end)',
          }}
        >
          {placed.map(({ item, span, column, columns }) => {
            if (span.startMinute > hours.endHour * 60) return null;

            const top = ((span.startMinute - gridStartMinute) / gridMinutes) * 100;
            const height =
              ((Math.min(span.endMinute, hours.endHour * 60) - span.startMinute) /
                gridMinutes) *
              100;

            return (
              <div
                key={item.id}
                className="absolute"
                style={{
                  top: `${top}%`,
                  height: `${height}%`,
                  left: `${(column / columns) * 100}%`,
                  width: `${(1 / columns) * 100}%`,
                  paddingRight: 'var(--block-gap)',
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  aria-label={`${item.code} ${item.name}`}
                  className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <ClassBlock
                    meeting={item}
                    detail={blockDetail(span)}
                    timeZone={timeZone}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* The now-line, here too. */}
        {nowPercent !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px bg-accent"
            style={{ top: `${nowPercent}%`, opacity: 'var(--now-line-opacity)' }}
          >
            <span
              className="absolute rounded-full bg-accent"
              style={{
                left: 'var(--day-block-inset-start)',
                width: 'var(--now-dot-size)',
                height: 'var(--now-dot-size)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
