// The arithmetic behind /calendar, kept out of the components so it can be
// tested without a browser and without a database.
//
// Nothing here imports a module or a React component. It works on the shape of
// a meeting and the shape of a deadline, which is enough to answer the four
// questions the grid asks:
//
//   which days are on screen?      -> weekDates / visibleDates / monthGrid
//   which hours are on screen?     -> croppedHours   (never 00:00-23:59)
//   where does this block sit?     -> spanOfDay
//   who is beside whom?            -> layoutDay      (overlaps split, never stacked)
//
// docs/DESIGN.md is the specification for every number in here.

import type { CourseColour } from './course-colours';
import {
  localDateKey,
  localTimeLabel,
  shiftDate,
  weekdayOf,
  zonedToUtc,
  type CalendarDate,
} from './time';

// ---------------------------------------------------------------------------
// What the views are handed
// ---------------------------------------------------------------------------

export type CalendarView = 'week' | 'day' | 'month';

/**
 * `auto` is the state before anyone has chosen: week on a laptop, day on a
 * phone. It is resolved in CSS rather than in JavaScript so the right view is
 * already painted on the first frame, on either device, with no flash and no
 * guess about the viewport during server rendering.
 */
export type CalendarViewChoice = CalendarView | 'auto';

export const CALENDAR_VIEWS: CalendarView[] = ['week', 'day', 'month'];

export function isCalendarView(value: string | null | undefined): value is CalendarView {
  return value === 'week' || value === 'day' || value === 'month';
}

/** '?v=' is a hint, not a promise. Anything else means "not chosen yet". */
export function viewFromParam(value: string | undefined): CalendarViewChoice {
  return isCalendarView(value) ? value : 'auto';
}

/** '?d=' likewise: a malformed date falls back rather than throwing a 500. */
export function dateFromParam(
  value: string | undefined,
  fallback: CalendarDate
): CalendarDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

/** One lecture, flattened for the grid. Instants are ISO strings. */
export type CalendarMeeting = {
  id: string;
  courseId: string;
  /** 'ME301'. */
  code: string;
  name: string;
  colour: CourseColour;
  room: string | null;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
};

/** One deadline. Never drawn inside the time grid — chips only. */
export type CalendarDeadline = {
  id: string;
  title: string;
  code: string | null;
  colour: CourseColour | null;
  dueAt: string;
};

// ---------------------------------------------------------------------------
// Days on screen
// ---------------------------------------------------------------------------

/** Monday. `sessions.weekday` is 0=Sun..6=Sat, so Monday is 1. */
export const WEEK_STARTS_ON = 1;

/** Saturday and Sunday — the two columns a week without weekend classes drops. */
const WEEKEND = [6, 0];

/** The Monday on or before `date`. */
export function startOfWeek(date: CalendarDate): CalendarDate {
  const shift = (weekdayOf(date) - WEEK_STARTS_ON + 7) % 7;
  return shiftDate(date, -shift);
}

/** The seven dates of `date`'s week, Monday first. */
export function weekDates(date: CalendarDate): CalendarDate[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

/** True when `date` is a Saturday or a Sunday. */
export function isWeekend(date: CalendarDate): boolean {
  return WEEKEND.includes(weekdayOf(date));
}

/**
 * The columns a week view shows: five if there are no weekend classes that
 * week, seven if there are. docs/DESIGN.md — "detect it".
 */
export function visibleDates(
  dates: readonly CalendarDate[],
  byDate: ReadonlyMap<CalendarDate, unknown[]>
): CalendarDate[] {
  const busyWeekend = dates.some(
    (date) => isWeekend(date) && (byDate.get(date)?.length ?? 0) > 0
  );
  return busyWeekend ? [...dates] : dates.filter((date) => !isWeekend(date));
}

/** Six Monday-first rows covering `anchor`'s month, with the spill either side. */
export function monthGrid(anchor: CalendarDate): CalendarDate[][] {
  const firstOfMonth = `${anchor.slice(0, 7)}-01`;
  const start = startOfWeek(firstOfMonth);

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => shiftDate(start, week * 7 + day))
  );
}

/** '2026-08-24' and '2026-08-31' are the same month; '2026-09-01' is not. */
export function sameMonth(a: CalendarDate, b: CalendarDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Group anything dated by the local day it falls on. */
export function groupByDate<T>(
  items: readonly T[],
  instantOf: (item: T) => string,
  timeZone: string
): Map<CalendarDate, T[]> {
  const byDate = new Map<CalendarDate, T[]>();

  for (const item of items) {
    const date = localDateKey(new Date(instantOf(item)), timeZone);
    const day = byDate.get(date);
    if (day) day.push(item);
    else byDate.set(date, [item]);
  }

  return byDate;
}

// ---------------------------------------------------------------------------
// Hours on screen
// ---------------------------------------------------------------------------

/** What an empty week shows: 08:00 to 18:00, so the grid is never a blank slab. */
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 18;

export type HourRange = { startHour: number; endHour: number };

/**
 * The auto-cropped time range: the earliest class in view, padded an hour back,
 * to the latest, padded an hour forward.
 *
 * docs/DESIGN.md calls a calendar mostly full of empty night hours "the single
 * most common way this screen goes wrong". This function is the reason it does
 * not happen, so it is the thing lib/calendar.test.ts leans on hardest.
 */
export function croppedHours(
  meetings: readonly CalendarMeeting[],
  dates: readonly CalendarDate[],
  timeZone: string
): HourRange {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;

  // The day's boundaries are computed once per column rather than once per
  // meeting: this is handed every meeting in the loaded window — twenty weeks
  // of them — and `zonedToUtc` builds an Intl formatter each time it is
  // called. Same answer as calling spanOfDay in the inner loop, two orders of
  // magnitude less work.
  for (const date of dates) {
    const midnight = zonedToUtc(date, '00:00:00', timeZone).getTime();
    const nextMidnight = zonedToUtc(shiftDate(date, 1), '00:00:00', timeZone).getTime();
    const dayLength = (nextMidnight - midnight) / 60_000;

    for (const meeting of meetings) {
      const starts = new Date(meeting.startsAt).getTime();
      if (starts >= nextMidnight) continue;
      const ends = new Date(meeting.endsAt).getTime();
      if (ends <= midnight) continue;

      earliest = Math.min(earliest, Math.max(0, (starts - midnight) / 60_000));
      latest = Math.max(latest, Math.min(dayLength, (ends - midnight) / 60_000));
    }
  }

  if (earliest === Number.POSITIVE_INFINITY) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }

  const startHour = Math.max(0, Math.floor(earliest / 60) - 1);
  const endHour = Math.min(24, Math.ceil(latest / 60) + 1);

  // A single 30-minute class would otherwise be a two-hour window; that is
  // fine. This only guards the degenerate case of a zero-height grid.
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

/** The hour marks drawn down the gutter: startHour..endHour - 1. */
export function hoursIn(range: HourRange): number[] {
  return Array.from(
    { length: range.endHour - range.startHour },
    (_, index) => range.startHour + index
  );
}

/** '09:00'. Mono, right-aligned, sitting on the hour line. */
export function formatHour(hour: number): string {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}

// ---------------------------------------------------------------------------
// Where a block sits
// ---------------------------------------------------------------------------

export type DaySpan = {
  /** Minutes after local midnight, clamped into the day. */
  startMinute: number;
  endMinute: number;
};

/**
 * Where a meeting sits inside one local day, in minutes after midnight, or
 * null when it does not touch that day at all.
 *
 * Measured against the day's own midnight instant rather than by reading the
 * clock face, so a lecture that runs past midnight is clipped to the day it is
 * being drawn on instead of wrapping round to the top of the grid.
 */
export function spanOfDay(
  meeting: { startsAt: string; endsAt: string },
  date: CalendarDate,
  timeZone: string
): DaySpan | null {
  const midnight = zonedToUtc(date, '00:00:00', timeZone).getTime();
  const nextMidnight = zonedToUtc(shiftDate(date, 1), '00:00:00', timeZone).getTime();

  const starts = new Date(meeting.startsAt).getTime();
  const ends = new Date(meeting.endsAt).getTime();
  if (ends <= midnight || starts >= nextMidnight) return null;

  const dayLength = (nextMidnight - midnight) / 60_000;
  return {
    startMinute: Math.max(0, (starts - midnight) / 60_000),
    endMinute: Math.min(dayLength, (ends - midnight) / 60_000),
  };
}

/**
 * How much of a class block there is room to say.
 *
 *   full    — subject code, course name, room and time
 *   compact — code and room. docs/DESIGN.md: "Under ~80px tall, drop the
 *             course name and keep code + room."
 *   tight   — code and room on one line. "A 30-minute block will only fit the
 *             code and room."
 *
 * The rule is written in pixels in DESIGN.md, but the week grid's hour row is
 * 80px, so ~80px tall is exactly one hour. Expressing it as a duration keeps
 * the measurement out of the components and out of this file's arithmetic —
 * nothing here has to know how tall a pixel is.
 */
export type BlockDetail = 'full' | 'compact' | 'tight';

export function blockDetail(span: DaySpan): BlockDetail {
  const minutes = span.endMinute - span.startMinute;
  if (minutes <= 30) return 'tight';
  if (minutes < 60) return 'compact';
  return 'full';
}

/** Minutes after local midnight for an instant — the now-line's position. */
export function minutesInto(at: Date, date: CalendarDate, timeZone: string): number {
  const midnight = zonedToUtc(date, '00:00:00', timeZone).getTime();
  return (at.getTime() - midnight) / 60_000;
}

/** '09:00–10:30'. En dash, because it is a range and not a subtraction. */
export function timeRange(
  meeting: { startsAt: string; endsAt: string },
  timeZone: string
): string {
  const from = localTimeLabel(new Date(meeting.startsAt), timeZone);
  const to = localTimeLabel(new Date(meeting.endsAt), timeZone);
  return `${from}–${to}`;
}

/** 'HH:MM' in the user's zone. */
export function timeAt(instant: string, timeZone: string): string {
  return localTimeLabel(new Date(instant), timeZone);
}

// ---------------------------------------------------------------------------
// Who is beside whom
// ---------------------------------------------------------------------------

export type Placed<T> = {
  item: T;
  span: DaySpan;
  /** 0-based position across the column. */
  column: number;
  /** How many blocks share the width here. 1 when nothing overlaps. */
  columns: number;
};

/**
 * Split a day's meetings into side-by-side columns so that two classes at the
 * same hour sit beside each other. docs/DESIGN.md: "never stack so one hides
 * another."
 *
 * Meetings that do not overlap anything keep the full width — the split is per
 * cluster of mutually overlapping blocks, not per day, so one clash on Tuesday
 * does not halve every other block on the screen.
 */
export function layoutDay<T extends { startsAt: string; endsAt: string }>(
  meetings: readonly T[],
  date: CalendarDate,
  timeZone: string
): Placed<T>[] {
  const onThisDay: { item: T; span: DaySpan }[] = [];
  for (const meeting of meetings) {
    const span = spanOfDay(meeting, date, timeZone);
    if (span) onThisDay.push({ item: meeting, span });
  }

  onThisDay.sort(
    (a, b) => a.span.startMinute - b.span.startMinute || a.span.endMinute - b.span.endMinute
  );

  const placed: Placed<T>[] = [];
  // One cluster of blocks that overlap each other, directly or through a chain.
  let cluster: Placed<T>[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  function closeCluster() {
    const width = cluster.reduce((most, entry) => Math.max(most, entry.column + 1), 1);
    for (const entry of cluster) entry.columns = width;
    placed.push(...cluster);
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  }

  // The end minute of the block currently sitting in each column.
  let columnEnds: number[] = [];

  for (const entry of onThisDay) {
    if (entry.span.startMinute >= clusterEnd) {
      closeCluster();
      columnEnds = [];
    }

    let column = columnEnds.findIndex((end) => end <= entry.span.startMinute);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = entry.span.endMinute;

    cluster.push({ item: entry.item, span: entry.span, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, entry.span.endMinute);
  }
  closeCluster();

  return placed;
}

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

/** Drags land on the quarter hour. Nothing on a timetable starts at 09:07. */
export const SNAP_MINUTES = 15;

/** The shortest a class can be dragged down to. */
export const MIN_MEETING_MINUTES = 15;

export function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/**
 * Move a meeting by whole minutes, keeping its length. Used by the week grid's
 * drag; it returns new instants and touches nothing else, which is what makes
 * "editing one meeting never affects the others" true by construction.
 */
export function movedBy(
  meeting: { startsAt: string; endsAt: string },
  minutes: number
): { startsAt: string; endsAt: string } {
  const shift = minutes * 60_000;
  return {
    startsAt: new Date(new Date(meeting.startsAt).getTime() + shift).toISOString(),
    endsAt: new Date(new Date(meeting.endsAt).getTime() + shift).toISOString(),
  };
}

/** Drag the bottom edge: the start stays put, the end moves, never past it. */
export function resizedBy(
  meeting: { startsAt: string; endsAt: string },
  minutes: number
): { startsAt: string; endsAt: string } {
  const starts = new Date(meeting.startsAt).getTime();
  const ends = new Date(meeting.endsAt).getTime() + minutes * 60_000;
  const floor = starts + MIN_MEETING_MINUTES * 60_000;

  return {
    startsAt: meeting.startsAt,
    endsAt: new Date(Math.max(ends, floor)).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

// A CalendarDate is already local, so it is formatted as if it were UTC —
// applying a timezone to it a second time is how dates slide by one day.
function formatWith(date: CalendarDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

/** 'Mon' — the day column heading. */
export function weekdayShort(date: CalendarDate): string {
  return formatWith(date, { weekday: 'short' });
}

/** '24' — the number under the day column heading. */
export function dayNumber(date: CalendarDate): string {
  return formatWith(date, { day: 'numeric' });
}

/** 'Monday 24 August' — the day view's subtitle. */
export function dayTitle(date: CalendarDate): string {
  return formatWith(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** 'August 2026' — the month view's subtitle. */
export function monthTitle(date: CalendarDate): string {
  return formatWith(date, { month: 'long', year: 'numeric' });
}

/** '24–30 August 2026', or '31 August – 6 September 2026' across a boundary. */
export function weekTitle(dates: readonly CalendarDate[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];

  if (sameMonth(first, last)) {
    return `${dayNumber(first)}–${dayNumber(last)} ${monthTitle(last)}`;
  }
  return `${formatWith(first, { day: 'numeric', month: 'long' })} – ${dayNumber(last)} ${monthTitle(last)}`;
}
