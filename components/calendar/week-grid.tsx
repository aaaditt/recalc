// The week grid — the default view on a laptop, and the most-looked-at thing
// in the app.
//
// Built by hand. docs/DECISIONS.md rejected FullCalendar and react-big-calendar
// because both impose their own DOM and would have to be fought for the
// rail-and-tint treatment and the auto-cropped range. The grid itself is not
// the hard part; the arithmetic is, and that lives in lib/calendar.ts with a
// test around it.
//
// Everything measurable in here comes from docs/DESIGN.md, "Week grid":
//   hour row 80px · gutter 56px · hairlines in --line · today barely tinted
//   now-line 1px accent at 55% with a 7px dot · overlaps split with a 3px gap
//   deadlines in a 42px all-day row, never inside the grid

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { ClassBlock } from '@/components/calendar/class-block';
import { DeadlineChip } from '@/components/calendar/deadline-chip';
import {
  blockDetail,
  dayNumber,
  formatHour,
  hoursIn,
  layoutDay,
  minutesInto,
  movedBy,
  resizedBy,
  snap,
  weekdayShort,
  type CalendarDeadline,
  type CalendarMeeting,
  type HourRange,
} from '@/lib/calendar';
import type { CalendarDate } from '@/lib/time';
import { cx } from '@/lib/cx';

/** How far the pointer must travel before a click becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

type Drag = {
  id: string;
  mode: 'move' | 'resize';
  pointerX: number;
  pointerY: number;
  /** The columns box, measured once when the drag starts. */
  gridWidth: number;
  gridHeight: number;
  minutes: number;
  days: number;
  moved: boolean;
};

type WeekGridProps = {
  dates: CalendarDate[];
  today: CalendarDate;
  timeZone: string;
  hours: HourRange;
  meetingsByDate: ReadonlyMap<CalendarDate, CalendarMeeting[]>;
  deadlinesByDate: ReadonlyMap<CalendarDate, CalendarDeadline[]>;
  /** Null until the client has mounted, so the server renders no now-line. */
  now: Date | null;
  onOpen: (meeting: CalendarMeeting) => void;
  onReschedule: (id: string, startsAt: string, endsAt: string) => void;
};

export function WeekGrid({
  dates,
  today,
  timeZone,
  hours,
  meetingsByDate,
  deadlinesByDate,
  now,
  onOpen,
  onReschedule,
}: WeekGridProps) {
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const hourMarks = hoursIn(hours);
  const gridStartMinute = hours.startHour * 60;
  const gridMinutes = (hours.endHour - hours.startHour) * 60;

  /** Where a minute-of-day sits down the grid, as a percentage. Null if off it. */
  function percentOf(minute: number): number | null {
    if (minute < gridStartMinute || minute > hours.endHour * 60) return null;
    return ((minute - gridStartMinute) / gridMinutes) * 100;
  }

  const todayIndex = dates.indexOf(today);
  const nowMinute = now ? minutesInto(now, today, timeZone) : null;
  const nowPercent =
    nowMinute === null || todayIndex === -1 ? null : percentOf(nowMinute);

  // ---- dragging -----------------------------------------------------------
  //
  // Mouse only. A week grid is a laptop screen; on a phone the day view is the
  // default and a class is edited by tapping it open. Gating on pointerType
  // keeps a scroll gesture from becoming an accidental reschedule.

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    meeting: CalendarMeeting,
    mode: Drag['mode']
  ) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: meeting.id,
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      gridWidth: rect.width,
      gridHeight: rect.height,
      minutes: 0,
      days: 0,
      moved: false,
    });
  }

  function continueDrag(event: ReactPointerEvent<HTMLElement>, dayIndex: number) {
    if (!drag) return;

    const dx = event.clientX - drag.pointerX;
    const dy = event.clientY - drag.pointerY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    const minutes = snap((dy / drag.gridHeight) * gridMinutes);
    const columnWidth = drag.gridWidth / dates.length;
    const days =
      drag.mode === 'move'
        ? Math.max(
            -dayIndex,
            Math.min(dates.length - 1 - dayIndex, Math.round(dx / columnWidth))
          )
        : 0;

    setDrag({ ...drag, minutes, days, moved: true });
  }

  function endDrag(meeting: CalendarMeeting) {
    if (!drag) return;
    const { mode, minutes, days, moved } = drag;
    setDrag(null);

    // A press that never travelled is a click: open the class.
    if (!moved || (minutes === 0 && days === 0)) {
      onOpen(meeting);
      return;
    }

    const times =
      mode === 'move'
        ? movedBy(meeting, minutes + days * 24 * 60)
        : resizedBy(meeting, minutes);
    onReschedule(meeting.id, times.startsAt, times.endsAt);
  }

  // ---- markup -------------------------------------------------------------

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* Day headings. */}
      <div className="flex border-b border-border">
        <div className="w-(--week-gutter-width) shrink-0" />
        {dates.map((date) => (
          <div
            key={date}
            className="min-w-0 flex-1 border-l border-line px-2 py-2 text-center"
            style={date === today ? { backgroundColor: 'var(--today-tint)' } : undefined}
          >
            <div className="font-mono text-label text-faint uppercase">
              {weekdayShort(date)}
            </div>
            <div className={cx('text-14', date === today && 'font-semibold text-ink')}>
              {dayNumber(date)}
            </div>
          </div>
        ))}
      </div>

      {/* The all-day row. Deadlines live here and nowhere else. */}
      <div className="flex h-(--allday-row-height) border-b border-border">
        <div className="flex w-(--week-gutter-width) shrink-0 items-center justify-end pr-2 font-mono text-label text-faint uppercase">
          Due
        </div>
        {dates.map((date) => (
          <div
            key={date}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden border-l border-line px-1"
            style={date === today ? { backgroundColor: 'var(--today-tint)' } : undefined}
          >
            {(deadlinesByDate.get(date) ?? []).map((deadline) => (
              <DeadlineChip key={deadline.id} deadline={deadline} timeZone={timeZone} />
            ))}
          </div>
        ))}
      </div>

      {/* The grid itself. */}
      <div className="relative flex">
        {/* Time gutter: mono, right-aligned, sitting on the hour line. */}
        <div className="w-(--week-gutter-width) shrink-0">
          {hourMarks.map((hour) => (
            <div
              key={hour}
              className="h-(--week-hour-height) pr-2 pt-1 text-right font-mono text-12 text-faint"
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* Day columns. */}
        <div ref={columnsRef} className="flex min-w-0 flex-1">
          {dates.map((date, dayIndex) => {
            const placed = layoutDay(meetingsByDate.get(date) ?? [], date, timeZone);

            return (
              <div
                key={date}
                className="relative min-w-0 flex-1 border-l border-line"
                style={date === today ? { backgroundColor: 'var(--today-tint)' } : undefined}
              >
                {/* Hour lines. The first is the all-day row's own border. */}
                {hourMarks.map((hour, index) => (
                  <div
                    key={hour}
                    className={cx(
                      'h-(--week-hour-height)',
                      index > 0 && 'border-t border-line'
                    )}
                  />
                ))}

                {/* Blocks, inset from the column dividers by the 3px gap. */}
                <div
                  className="absolute inset-y-0"
                  style={{ left: 'var(--block-gap)', right: 'var(--block-gap)' }}
                >
                  {placed.map(({ item, span, column, columns }) => {
                    const top = percentOf(span.startMinute);
                    if (top === null) return null;

                    const height =
                      ((Math.min(span.endMinute, hours.endHour * 60) - span.startMinute) /
                        gridMinutes) *
                      100;

                    // While this block is being dragged it is nudged by the
                    // pointer, snapped to the quarter hour, so the drop lands
                    // where it looks like it will.
                    const active = drag?.id === item.id && drag.moved ? drag : null;
                    const nudgePx = active ? (active.minutes / gridMinutes) * active.gridHeight : 0;
                    const acrossPx = active ? (active.days * active.gridWidth) / dates.length : 0;

                    return (
                      <div
                        key={item.id}
                        className="absolute"
                        style={{
                          top: `${top}%`,
                          height:
                            active?.mode === 'resize'
                              ? `calc(${height}% + ${nudgePx}px)`
                              : `${height}%`,
                          left: `${(column / columns) * 100}%`,
                          width: `${(1 / columns) * 100}%`,
                          paddingRight: 'var(--block-gap)',
                          transform:
                            active?.mode === 'move'
                              ? `translate(${acrossPx}px, ${nudgePx}px)`
                              : undefined,
                          zIndex: active ? 20 : undefined,
                        }}
                      >
                        <button
                          type="button"
                          onPointerDown={(event) => beginDrag(event, item, 'move')}
                          onPointerMove={(event) => continueDrag(event, dayIndex)}
                          onPointerUp={() => endDrag(item)}
                          onPointerCancel={() => setDrag(null)}
                          aria-label={`${item.code} ${item.name}`}
                          className="block h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <ClassBlock
                            meeting={item}
                            detail={blockDetail(span)}
                            timeZone={timeZone}
                            dragging={active !== null}
                          />
                        </button>

                        {/* The resize handle: the bottom edge of the block. */}
                        <div
                          onPointerDown={(event) => beginDrag(event, item, 'resize')}
                          onPointerMove={(event) => continueDrag(event, dayIndex)}
                          onPointerUp={() => endDrag(item)}
                          onPointerCancel={() => setDrag(null)}
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                          style={{ marginRight: 'var(--block-gap)' }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* The 7px dot, in today's column only. */}
                {nowPercent !== null && date === today ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-10 rounded-full bg-accent"
                    style={{
                      top: `${nowPercent}%`,
                      left: 0,
                      width: 'var(--now-dot-size)',
                      height: 'var(--now-dot-size)',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* The now-line, across the full grid. */}
        {nowPercent !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 h-px bg-accent"
            style={{
              top: `${nowPercent}%`,
              left: 'var(--week-gutter-width)',
              opacity: 'var(--now-line-opacity)',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
