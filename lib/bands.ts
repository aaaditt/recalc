// The arithmetic behind the 24-hour view, kept out of the components so it can
// be tested without a browser and without a database.
//
// Nothing here imports a module or a React component. It works on the shape of
// a band and the shape of something dated, which is enough to answer the five
// questions the 24-hour grid asks:
//
//   which bands run today?     -> bandsOn
//   where does this band sit?  -> bandSpan
//   what is inside it?         -> fillOfBand / tickMarks
//   what does it say?          -> bandSummary
//   where did I just drag?     -> minuteAt / snapMinute
//
// The one rule this file exists to hold: it never renders 00:00–23:59 by
// accident. `docs/DESIGN.md` calls a calendar full of empty night hours "the
// single most common way this screen goes wrong", and `croppedHours` in
// lib/calendar.ts is what stops the class views doing it. This view is the
// deliberate exception — see FULL_DAY below — because here the empty hours are
// the subject rather than the noise.

import type { DaySpan, HourRange } from './calendar';
import type { CourseColour } from './course-colours';
import { weekdayOf, type CalendarDate } from './time';

// ---------------------------------------------------------------------------
// What the view is handed
// ---------------------------------------------------------------------------

export type BandKind = 'custom' | 'university';

/** One slot inside a band, flattened for the grid. Wall-clock, no date. */
export type BandSlotView = {
  id: string;
  label: string;
  /** 0=Sun .. 6=Sat. */
  weekday: number;
  /** 'HH:MM:SS'. */
  startsAt: string;
  endsAt: string;
  /**
   * The course this slot names, if it names one. Today it buys the slot a rail
   * and an 8% tint and nothing else; it is stored so that "20 minutes on Unit
   * 3" has something to count later.
   */
  courseId: string | null;
  code: string | null;
  colour: CourseColour | null;
};

/** One band, flattened for the grid. */
export type BandView = {
  id: string;
  name: string;
  kind: BandKind;
  /**
   * No colour, on purpose. docs/DESIGN.md principle 4: colour identifies a
   * course and nothing else. A band is chrome; the only colour inside one
   * belongs to what it contains.
   */
  startsAt: string;
  endsAt: string;
  weekdays: number[];
  /** Always empty for the university band — its contents are the timetable. */
  slots: BandSlotView[];
};

// ---------------------------------------------------------------------------
// Hours on screen
// ---------------------------------------------------------------------------

/**
 * The whole day, every day. The one view in this app that does not crop.
 *
 * `croppedHours` exists because a class calendar full of empty night hours is
 * useless. This screen is about the shape of a whole day, and the gap between
 * the last lecture and whatever happens next is the question it is asking. Crop
 * it and the feature is gone.
 */
export const FULL_DAY: HourRange = { startHour: 0, endHour: 24 };

/** Minutes in a full day. The denominator of every percentage on this grid. */
export const DAY_MINUTES = 24 * 60;

/**
 * Hour row height, in pixels — 36, against the week grid's 80 and the day
 * view's 72.
 *
 * docs/DESIGN.md gives no number for a 24-hour grid, so this one was chosen
 * from the numbers it does give. 80px × 24 is 1920px, which is a day you have
 * to scroll twice to see. 36px × 24 is 864px: a whole day at a glance on a
 * laptop, one short scroll on a phone. It is affordable only because this view
 * draws bands rather than individual classes — nothing on it has to fit three
 * lines of text into fifty minutes.
 */
export const FULL_DAY_HOUR_HEIGHT = 36;

/** Drag-to-create snaps to five minutes. Finer is a lie about pointer accuracy. */
export const SNAP_MINUTES = 5;

// ---------------------------------------------------------------------------
// Wall-clock arithmetic
// ---------------------------------------------------------------------------

/** 'HH:MM' or 'HH:MM:SS' -> minutes after midnight. */
export function clockMinutes(time: string): number {
  const [h, m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** Minutes after midnight -> 'HH:MM'. Zero-padded, so it sorts and compares. */
export function clockAt(minute: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES, Math.round(minute)));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Round to the nearest five minutes, inside the day. */
export function snapMinute(minute: number, step: number = SNAP_MINUTES): number {
  const snapped = Math.round(minute / step) * step;
  return Math.max(0, Math.min(DAY_MINUTES, snapped));
}

/**
 * Where a pointer at `offsetY` inside a grid `height` pixels tall is, in
 * minutes after midnight. The whole of the drag-to-create maths.
 */
export function minuteAt(offsetY: number, height: number): number {
  if (height <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, offsetY / height));
  return ratio * DAY_MINUTES;
}

// ---------------------------------------------------------------------------
// Bands on a day
// ---------------------------------------------------------------------------

/** The bands that run on `date`, in their stored order. */
export function bandsOn(bands: readonly BandView[], date: CalendarDate): BandView[] {
  const weekday = weekdayOf(date);
  return bands.filter((band) => band.weekdays.includes(weekday));
}

/** Where a band sits in the day, in minutes after midnight. */
export function bandSpan(band: BandView): DaySpan {
  return {
    startMinute: clockMinutes(band.startsAt),
    endMinute: clockMinutes(band.endsAt),
  };
}

/** A band's slots on one date, earliest first. */
export function slotsOn(band: BandView, date: CalendarDate): BandSlotView[] {
  const weekday = weekdayOf(date);
  return band.slots
    .filter((slot) => slot.weekday === weekday)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Which band covers `minute` on `date`, or null.
 *
 * Bands never overlap on a weekday — `modules/bands/service.ts` refuses it — so
 * there is exactly one answer and this can stop at the first hit. That rule is
 * the reason `/today` can say "you are in University" rather than handing back
 * a list.
 */
export function bandAt(
  bands: readonly BandView[],
  date: CalendarDate,
  minute: number
): BandView | null {
  for (const band of bandsOn(bands, date)) {
    const span = bandSpan(band);
    if (minute >= span.startMinute && minute < span.endMinute) return band;
  }
  return null;
}

// ---------------------------------------------------------------------------
// What is inside a band
// ---------------------------------------------------------------------------

/** Anything with a place in the day: a lecture's span, or a slot's. */
export type Occupant = { startMinute: number; endMinute: number };

/** The occupants that touch a band at all, clipped to its edges. */
export function insideBand(
  band: BandView,
  occupants: readonly Occupant[]
): Occupant[] {
  const { startMinute, endMinute } = bandSpan(band);

  return occupants
    .filter((one) => one.endMinute > startMinute && one.startMinute < endMinute)
    .map((one) => ({
      startMinute: Math.max(one.startMinute, startMinute),
      endMinute: Math.min(one.endMinute, endMinute),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
}

export type BandFill = {
  /** How many things are inside the band on this date. */
  count: number;
  /** Minutes inside the band that nothing covers. */
  freeMinutes: number;
  /** Where the last thing inside it ends, 'HH:MM', or null when it is empty. */
  lastEndsAt: string | null;
};

/**
 * How full a band is.
 *
 * Overlapping occupants are merged before the free time is counted, so two
 * classes at the same hour do not make the day look twice as busy as it is.
 */
export function fillOfBand(band: BandView, occupants: readonly Occupant[]): BandFill {
  const inside = insideBand(band, occupants);
  const span = bandSpan(band);
  const total = span.endMinute - span.startMinute;

  if (inside.length === 0) {
    return { count: 0, freeMinutes: total, lastEndsAt: null };
  }

  let covered = 0;
  let runStart = inside[0].startMinute;
  let runEnd = inside[0].endMinute;

  for (const one of inside.slice(1)) {
    if (one.startMinute > runEnd) {
      covered += runEnd - runStart;
      runStart = one.startMinute;
      runEnd = one.endMinute;
    } else if (one.endMinute > runEnd) {
      runEnd = one.endMinute;
    }
  }
  covered += runEnd - runStart;

  return {
    count: inside.length,
    freeMinutes: Math.max(0, total - covered),
    lastEndsAt: clockAt(Math.max(...inside.map((one) => one.endMinute))),
  };
}

/** '1h 20m', '45m', '2h'. Durations, never a bare number of minutes. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * The line under a band's name on the 24-hour view.
 *
 * An empty band says so plainly. "Nothing planned" is a fact worth reading at
 * 7:45am — it is the whole reason the empty hours are drawn at all — and it is
 * not an error state to be styled as one.
 */
export function bandSummary(band: BandView, fill: BandFill): string {
  if (fill.count === 0) return 'Nothing planned';

  const one = band.kind === 'university' ? 'class' : 'slot';
  const many = band.kind === 'university' ? 'classes' : 'slots';

  const parts = [`${fill.count} ${fill.count === 1 ? one : many}`];

  if (fill.freeMinutes > 0) parts.push(`${durationLabel(fill.freeMinutes)} free`);
  return parts.join(' · ');
}

/**
 * The thin rail of tick marks under a band's name: where the day's density is,
 * as percentages of the band's own width.
 */
export type Tick = { key: string; leftPercent: number; widthPercent: number };

export function tickMarks(
  band: BandView,
  occupants: readonly (Occupant & { key: string })[]
): Tick[] {
  const span = bandSpan(band);
  const total = span.endMinute - span.startMinute;
  if (total <= 0) return [];

  return occupants
    .filter((one) => one.endMinute > span.startMinute && one.startMinute < span.endMinute)
    .map((one) => {
      const from = Math.max(one.startMinute, span.startMinute);
      const to = Math.min(one.endMinute, span.endMinute);
      return {
        key: one.key,
        leftPercent: ((from - span.startMinute) / total) * 100,
        // A one-minute event still has to be visible, or the rail lies by omission.
        widthPercent: Math.max(1, ((to - from) / total) * 100),
      };
    });
}

// ---------------------------------------------------------------------------
// The zoomed view
// ---------------------------------------------------------------------------

/**
 * The hour range a zoomed band is drawn at: its own span, rounded out to whole
 * hours so the labels still sit on the lines.
 */
export function hoursOfBand(band: BandView): HourRange {
  const span = bandSpan(band);
  const startHour = Math.max(0, Math.floor(span.startMinute / 60));
  const endHour = Math.min(24, Math.ceil(span.endMinute / 60));
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

/** 'University · 07:30–15:40'. The zoomed view's subtitle. */
export function bandRangeLabel(band: BandView): string {
  return `${band.startsAt.slice(0, 5)}–${band.endsAt.slice(0, 5)}`;
}

/** Mon .. Sun for a band's days: 'Mon–Fri' where they run, else 'Mon, Wed, Fri'. */
const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdaysLabel(weekdays: readonly number[]): string {
  const days = [...weekdays].sort((a, b) => a - b);
  if (days.length === 0) return 'never';
  if (days.length === 7) return 'every day';

  // A run of consecutive days reads as a range. Sunday is 0 and would break the
  // run at the wrong end, so only Monday-first runs are collapsed.
  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  if (consecutive && days.length > 2 && days[0] >= 1) {
    return `${SHORT_DAY[days[0]]}–${SHORT_DAY[days[days.length - 1]]}`;
  }
  return days.map((day) => SHORT_DAY[day]).join(', ');
}

// ---------------------------------------------------------------------------
// From rows to what the views take
// ---------------------------------------------------------------------------

/**
 * The database's shape, described structurally rather than imported.
 *
 * This file may not import a module (see the header), and it does not need to:
 * every screen that draws a band has already read one, and this is the one
 * place the snake_case row becomes the camelCase view.
 */
export type BandRowLike = {
  id: string;
  name: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  weekdays: number[];
  slots: {
    id: string;
    label: string;
    course_id: string | null;
    weekday: number;
    starts_at: string;
    ends_at: string;
  }[];
};

/** A course's code and colour, keyed by id — what the pages already build. */
export type CourseLook = ReadonlyMap<string, { code: string; colour: CourseColour }>;

export function toBandViews(rows: readonly BandRowLike[], look: CourseLook): BandView[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind === 'university' ? 'university' : 'custom',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    slots: row.slots.map((slot) => {
      const course = slot.course_id ? look.get(slot.course_id) : undefined;
      return {
        id: slot.id,
        label: slot.label,
        courseId: slot.course_id,
        weekday: slot.weekday,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        code: course?.code ?? null,
        colour: course?.colour ?? null,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// The line on /today
// ---------------------------------------------------------------------------

/**
 * Which part of the day this is, and what is left of it.
 *
 * Null when the clock is inside no band at all — and that is the design, not a
 * missing case. An evening nobody has planned should not be announced as one;
 * the line appears when there is something true to say and stays away when
 * there is not.
 */
export type BandLine = {
  name: string;
  /** When the band ends, 'HH:MM'. */
  untilAt: string;
  /** The next thing inside it that has not started yet. */
  nextInside: { label: string; at: string } | null;
  /** The next band after this one today. */
  nextBand: { name: string; at: string } | null;
};

export function bandLine(
  bands: readonly BandView[],
  date: CalendarDate,
  minute: number,
  occupants: readonly (Occupant & { label: string })[]
): BandLine | null {
  const band = bandAt(bands, date, minute);
  if (!band) return null;

  const span = bandSpan(band);

  const upcoming = occupants
    .filter(
      (one) =>
        one.startMinute > minute &&
        one.startMinute >= span.startMinute &&
        one.startMinute < span.endMinute
    )
    .sort((a, b) => a.startMinute - b.startMinute)[0];

  const after = bandsOn(bands, date)
    .filter((other) => bandSpan(other).startMinute >= span.endMinute)
    .sort((a, b) => bandSpan(a).startMinute - bandSpan(b).startMinute)[0];

  return {
    name: band.name,
    untilAt: clockAt(span.endMinute),
    nextInside: upcoming
      ? { label: upcoming.label, at: clockAt(upcoming.startMinute) }
      : null,
    nextBand: after
      ? { name: after.name, at: clockAt(bandSpan(after).startMinute) }
      : null,
  };
}
