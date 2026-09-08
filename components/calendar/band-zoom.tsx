// One band, opened.
//
// The 24-hour view draws a band as a container with a count and a tick rail.
// This is what is inside it: the day cropped to the band's own span, at the day
// view's 72px hour row, with everything drawn at full docs/DESIGN.md size.
//
// For the university band that is the lectures themselves — read from
// `class_meetings`, which is where a class has always lived. The band holds no
// copy of them, so this screen and /calendar can never disagree.
//
// For every other band it is the band's own slots. Both are drawn, always: a
// one-off lecture that happens to fall inside the Evening band is still a real
// thing that is happening, and hiding it because of which table it came from
// would make the screen a lie.

import { ClassBlock } from '@/components/calendar/class-block';
import { SlotBlock } from '@/components/calendar/slot-block';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  bandRangeLabel,
  bandSpan,
  clockMinutes,
  hoursOfBand,
  slotsOn,
  weekdaysLabel,
  type BandView,
} from '@/lib/bands';
import {
  blockDetail,
  formatHour,
  hoursIn,
  minutesInto,
  spanOfDay,
  type CalendarMeeting,
} from '@/lib/calendar';
import { cx } from '@/lib/cx';
import type { CalendarDate } from '@/lib/time';

type BandZoomProps = {
  band: BandView;
  date: CalendarDate;
  today: CalendarDate;
  timeZone: string;
  meetings: CalendarMeeting[];
  now: Date | null;
  onClose: () => void;
  onOpenMeeting: (meeting: CalendarMeeting) => void;
  /** Where the band's slots are actually edited. */
  editHref: string;
};

export function BandZoom({
  band,
  date,
  today,
  timeZone,
  meetings,
  now,
  onClose,
  onOpenMeeting,
  editHref,
}: BandZoomProps) {
  const hours = hoursOfBand(band);
  const hourMarks = hoursIn(hours);
  const gridStartMinute = hours.startHour * 60;
  const gridMinutes = (hours.endHour - hours.startHour) * 60;

  const span = bandSpan(band);
  const slots = slotsOn(band, date);

  // Only what actually falls inside the band. A lecture at 18:00 belongs to
  // whatever band covers 18:00, not to this one.
  const placed = meetings
    .map((meeting) => ({ meeting, at: spanOfDay(meeting, date, timeZone) }))
    .filter(
      (one): one is { meeting: CalendarMeeting; at: NonNullable<typeof one.at> } =>
        one.at !== null &&
        one.at.endMinute > span.startMinute &&
        one.at.startMinute < span.endMinute
    );

  const nowMinute = now && date === today ? minutesInto(now, date, timeZone) : null;
  const nowPercent =
    nowMinute === null || nowMinute < gridStartMinute || nowMinute > hours.endHour * 60
      ? null
      : ((nowMinute - gridStartMinute) / gridMinutes) * 100;

  const empty = placed.length === 0 && slots.length === 0;

  function topPercent(startMinute: number): number {
    return ((startMinute - gridStartMinute) / gridMinutes) * 100;
  }

  function heightPercent(startMinute: number, endMinute: number): number {
    return ((endMinute - startMinute) / gridMinutes) * 100;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-16 font-medium">{band.name}</h2>
          <p className="font-mono text-12 text-muted tabular-nums">
            {bandRangeLabel(band)} · {weekdaysLabel(band.weekdays)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={editHref}
            className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {band.kind === 'university' ? 'Timetable' : 'Edit slots'}
          </a>
          <Button onClick={onClose}>Back to the day</Button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-card border border-border bg-surface">
        {hourMarks.map((hour, index) => (
          <div
            key={hour}
            className={cx('h-(--day-hour-height)', index > 0 && 'border-t border-line')}
          >
            <span className="pl-4 font-mono text-12 text-faint tabular-nums">
              {formatHour(hour)}
            </span>
          </div>
        ))}

        <div
          className="absolute inset-y-0"
          style={{
            left: 'var(--day-block-inset-start)',
            right: 'var(--day-block-inset-end)',
          }}
        >
          {placed.map(({ meeting, at }) => (
            <div
              key={meeting.id}
              className="absolute inset-x-0"
              style={{
                top: `${topPercent(at.startMinute)}%`,
                height: `${heightPercent(at.startMinute, at.endMinute)}%`,
                paddingRight: 'var(--block-gap)',
              }}
            >
              <button
                type="button"
                onClick={() => onOpenMeeting(meeting)}
                aria-label={`${meeting.code} ${meeting.name}`}
                className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ClassBlock meeting={meeting} detail={blockDetail(at)} timeZone={timeZone} />
              </button>
            </div>
          ))}

          {slots.map((slot) => {
            const from = clockMinutes(slot.startsAt);
            const to = clockMinutes(slot.endsAt);

            return (
              <div
                key={slot.id}
                className="absolute inset-x-0"
                style={{
                  top: `${topPercent(from)}%`,
                  height: `${heightPercent(from, to)}%`,
                  paddingRight: 'var(--block-gap)',
                }}
              >
                <SlotBlock slot={slot} tight={to - from < 60} />
              </div>
            );
          })}
        </div>

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

      {empty ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState
            title="Nothing in here yet"
            description={
              band.kind === 'university'
                ? 'No lectures on this day. The timetable is where classes are added.'
                : 'This band runs, but nothing is planned inside it on this day.'
            }
            action={
              <a
                href={editHref}
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                {band.kind === 'university' ? 'Open the timetable' : 'Add a slot'}
              </a>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
