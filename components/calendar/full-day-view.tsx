// The 24-hour view — the first screen in this app that draws a whole day.
//
// docs/DESIGN.md says a calendar must auto-crop its hours, and calls a grid
// full of empty night hours "the single most common way this screen goes
// wrong". That rule is written for the class views and it still binds them.
// This view is the deliberate exception, because here the empty hours ARE the
// content: the gap between the last lecture and whatever happens next is the
// question the screen exists to ask. See lib/bands.ts, FULL_DAY.
//
// One day at a time, not seven columns. Twenty-four hours across five columns
// is unreadable on a laptop and absurd on a phone, and the feature is about the
// shape of a day rather than of a week.
//
// What it draws:
//   - bands, as containers with a summary and a tick rail (never as a pile of
//     individual classes — that is what opening one is for)
//   - anything that falls outside every band, as an ordinary class block,
//     because a band is a frame and not a filter
//   - the now-line, and which band the clock is inside
//   - a drag-selected range, which becomes a new band

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { BandBlock, type BandTick } from '@/components/calendar/band-block';
import { ClassBlock } from '@/components/calendar/class-block';
import { DateStrip } from '@/components/calendar/date-strip';
import { DeadlineChip } from '@/components/calendar/deadline-chip';
import {
  bandAt,
  bandSpan,
  bandsOn,
  bandSummary,
  clockAt,
  clockMinutes,
  DAY_MINUTES,
  fillOfBand,
  minuteAt,
  slotsOn,
  snapMinute,
  tickMarks,
  type BandView,
} from '@/lib/bands';
import {
  blockDetail,
  formatHour,
  minutesInto,
  spanOfDay,
  type CalendarDeadline,
  type CalendarMeeting,
} from '@/lib/calendar';
import { cx } from '@/lib/cx';
import { weekdayOf, type CalendarDate } from '@/lib/time';

/** The hours down the gutter. All of them, every day. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** A drag shorter than this is a tap that wobbled, not a range. */
const MIN_DRAFT_MINUTES = 15;

/** How long a finger has to rest before a drag starts, so scrolling still works. */
const HOLD_MS = 350;

export type BandDraft = { startsAt: string; endsAt: string; weekday: number };

type FullDayViewProps = {
  date: CalendarDate;
  weekDates: CalendarDate[];
  today: CalendarDate;
  timeZone: string;
  bands: BandView[];
  meetingsByDate: ReadonlyMap<CalendarDate, CalendarMeeting[]>;
  deadlinesByDate: ReadonlyMap<CalendarDate, CalendarDeadline[]>;
  now: Date | null;
  onSelect: (date: CalendarDate) => void;
  onOpenBand: (bandId: string) => void;
  onOpenMeeting: (meeting: CalendarMeeting) => void;
  /** A finished drag. The sheet opens pre-filled with this. */
  onDraft: (draft: BandDraft) => void;
};

export function FullDayView({
  date,
  weekDates,
  today,
  timeZone,
  bands,
  meetingsByDate,
  deadlinesByDate,
  now,
  onSelect,
  onOpenBand,
  onOpenMeeting,
  onDraft,
}: FullDayViewProps) {
  const meetings = meetingsByDate.get(date) ?? [];
  const deadlines = deadlinesByDate.get(date) ?? [];
  const running = bandsOn(bands, date);

  // Every meeting, placed in this day. Computed once and reused three times:
  // for the bands' summaries, for their tick rails, and for the loose blocks.
  const placed = meetings
    .map((meeting) => ({ meeting, span: spanOfDay(meeting, date, timeZone) }))
    .filter((one): one is { meeting: CalendarMeeting; span: NonNullable<typeof one.span> } =>
      one.span !== null
    );

  const nowMinute = now && date === today ? minutesInto(now, date, timeZone) : null;
  const currentBand = nowMinute === null ? null : bandAt(bands, date, nowMinute);

  // A class inside a band is drawn by that band's summary and tick rail, so
  // drawing it again here would be saying the same thing twice. A class outside
  // every band is drawn in full, because a band is a frame and not a filter.
  const loose = placed.filter(
    ({ span }) => bandAt(bands, date, span.startMinute) === null
  );

  // ---- drag to create -----------------------------------------------------

  const gridRef = useRef<HTMLDivElement>(null);
  const anchorMinute = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<{ from: number; to: number } | null>(null);

  function minuteFromEvent(event: ReactPointerEvent<HTMLDivElement>): number {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return snapMinute(minuteAt(event.clientY - rect.top, rect.height));
  }

  function cancelHold() {
    if (holdTimer.current === null) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Only ever the background layer: the bands sit above this one, so a press
    // on a band never reaches here and never starts a drag.
    const minute = minuteFromEvent(event);

    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return;
      anchorMinute.current = minute;
      setDraft({ from: minute, to: minute });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    // On a touch screen an immediate drag would steal every scroll. The finger
    // has to rest first — and there is a 44px "New band" button in the toolbar
    // for anyone who would rather not hold anything down at all.
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    holdTimer.current = setTimeout(() => {
      anchorMinute.current = minute;
      setDraft({ from: minute, to: minute });
      if (target.hasPointerCapture?.(pointerId) === false) {
        target.setPointerCapture(pointerId);
      }
    }, HOLD_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (anchorMinute.current === null) {
      // Moved before the hold completed — that was a scroll, not a draw.
      cancelHold();
      return;
    }
    setDraft({ from: anchorMinute.current, to: minuteFromEvent(event) });
  }

  function onPointerUp() {
    cancelHold();

    const anchor = anchorMinute.current;
    anchorMinute.current = null;
    const drawn = draft;
    setDraft(null);

    if (anchor === null || !drawn) return;

    const from = Math.min(drawn.from, drawn.to);
    const to = Math.max(drawn.from, drawn.to);
    if (to - from < MIN_DRAFT_MINUTES) return;

    onDraft({
      startsAt: clockAt(from),
      endsAt: clockAt(to),
      weekday: weekdayOf(date),
    });
  }

  const draftFrom = draft ? Math.min(draft.from, draft.to) : 0;
  const draftTo = draft ? Math.max(draft.from, draft.to) : 0;
  const drafting = draft !== null && draftTo - draftFrom >= MIN_DRAFT_MINUTES;

  // ---- markup -------------------------------------------------------------

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
        {/* Twenty-four hour rows. Nothing is cropped and nothing is collapsed:
            the empty stretches are the point of the screen. */}
        <div ref={gridRef}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className={cx(
                'h-(--fullday-hour-height)',
                hour > 0 && 'border-t border-line'
              )}
            >
              <span className="pl-3 font-mono text-12 text-faint tabular-nums">
                {formatHour(hour)}
              </span>
            </div>
          ))}
        </div>

        {/* The drag layer, behind everything clickable. */}
        <div
          className="absolute inset-y-0 touch-pan-y"
          style={{ left: 'var(--week-gutter-width)', right: 'var(--day-block-inset-end)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {drafting ? (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 border border-dashed border-accent bg-accent-bg/60"
              style={{
                top: `${(draftFrom / DAY_MINUTES) * 100}%`,
                height: `${((draftTo - draftFrom) / DAY_MINUTES) * 100}%`,
                borderRadius: 'var(--band-draft-radius)',
              }}
            >
              <span className="px-2 font-mono text-12 text-accent tabular-nums">
                {clockAt(draftFrom)}–{clockAt(draftTo)}
              </span>
            </div>
          ) : null}
        </div>

        {/* Bands and loose classes, above the drag layer so pressing one opens
            it rather than starting to draw a new band on top of it. */}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: 'var(--week-gutter-width)', right: 'var(--day-block-inset-end)' }}
        >
          {running.map((band) => {
            const span = bandSpan(band);
            const slots = slotsOn(band, date);

            const occupants = [
              ...placed
                .filter(
                  ({ span: at }) =>
                    at.endMinute > span.startMinute && at.startMinute < span.endMinute
                )
                .map(({ meeting, span: at }) => ({
                  key: meeting.id,
                  colour: meeting.colour,
                  startMinute: at.startMinute,
                  endMinute: at.endMinute,
                })),
              ...slots.map((slot) => ({
                key: slot.id,
                colour: slot.colour,
                startMinute: clockMinutes(slot.startsAt),
                endMinute: clockMinutes(slot.endsAt),
              })),
            ];

            const fill = fillOfBand(band, occupants);
            const ticks: BandTick[] = tickMarks(band, occupants).map((tick) => ({
              ...tick,
              colour: occupants.find((one) => one.key === tick.key)?.colour ?? null,
            }));

            const heightPercent = ((span.endMinute - span.startMinute) / DAY_MINUTES) * 100;

            return (
              <div
                key={band.id}
                className="pointer-events-auto absolute inset-x-0 pr-(--block-gap)"
                style={{
                  top: `${(span.startMinute / DAY_MINUTES) * 100}%`,
                  height: `${heightPercent}%`,
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenBand(band.id)}
                  aria-label={`Open ${band.name}`}
                  className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <BandBlock
                    band={band}
                    summary={bandSummary(band, fill)}
                    ticks={ticks}
                    current={currentBand?.id === band.id}
                    // Under about an hour and three quarters there is only room
                    // for the name. 36px an hour is what makes that the cutoff.
                    compact={span.endMinute - span.startMinute < 105}
                  />
                </button>
              </div>
            );
          })}

          {loose.map(({ meeting, span }) => (
            <div
              key={meeting.id}
              className="pointer-events-auto absolute inset-x-0 pr-(--block-gap)"
              style={{
                top: `${(span.startMinute / DAY_MINUTES) * 100}%`,
                height: `${((span.endMinute - span.startMinute) / DAY_MINUTES) * 100}%`,
              }}
            >
              <button
                type="button"
                onClick={() => onOpenMeeting(meeting)}
                aria-label={`${meeting.code} ${meeting.name}`}
                className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ClassBlock meeting={meeting} detail={blockDetail(span)} timeZone={timeZone} />
              </button>
            </div>
          ))}
        </div>

        {/* The now-line. The one other place the accent is allowed. */}
        {nowMinute !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px bg-accent"
            style={{
              top: `${(nowMinute / DAY_MINUTES) * 100}%`,
              opacity: 'var(--now-line-opacity)',
            }}
          >
            <span
              className="absolute rounded-full bg-accent"
              style={{
                left: 'var(--week-gutter-width)',
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
