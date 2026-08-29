// The shape of the printed timetable, as data.
//
// Rows are numbered periods, columns are weekdays, and a cell holds whatever
// classes sit at that intersection. Everything here is pure: it takes rows and
// gives back the grid, so the component that draws it has no arithmetic in it
// and this file can be reasoned about without a browser.

import type { CourseColour } from '@/lib/course-colours';

/** Monday to Friday, in `sessions.weekday` numbering (0=Sun .. 6=Sat). */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_NAMES: Record<number, { long: string; short: string }> = {
  0: { long: 'Sunday', short: 'Sun' },
  1: { long: 'Monday', short: 'Mon' },
  2: { long: 'Tuesday', short: 'Tue' },
  3: { long: 'Wednesday', short: 'Wed' },
  4: { long: 'Thursday', short: 'Thu' },
  5: { long: 'Friday', short: 'Fri' },
  6: { long: 'Saturday', short: 'Sat' },
};

export function weekdayName(weekday: number): { long: string; short: string } {
  return WEEKDAY_NAMES[weekday] ?? { long: '—', short: '—' };
}

/** 'HH:MM:SS' or 'HH:MM' -> 'HH:MM'. Postgres `time` comes back with seconds. */
export function clockLabel(time: string): string {
  return time.slice(0, 5);
}

/** '07:30:00' + '08:20:00' -> '07:30 – 08:20'. */
export function periodRange(startsAt: string, endsAt: string): string {
  return `${clockLabel(startsAt)} – ${clockLabel(endsAt)}`;
}

/** A period, as the grid's left-hand column needs it. */
export type TimetablePeriod = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
};

/** One class in one cell. Already resolved against its course. */
export type TimetableClass = {
  sessionId: string;
  courseId: string;
  code: string;
  name: string;
  colour: CourseColour;
  room: string | null;
  isLab: boolean;
  /** 0=Sun .. 6=Sat, straight off `sessions.weekday`. */
  weekday: number;
  /** The class's own times, which can differ from the period's. */
  startsAt: string;
  endsAt: string;
  /** Which grid row it was filed under, if any. */
  periodId: string | null;
};

export type TimetableCell = {
  period: TimetablePeriod;
  weekday: number;
  classes: TimetableClass[];
};

/** The key a cell is looked up by. Period and weekday together are the cell. */
export function cellKey(periodId: string, weekday: number): string {
  return `${periodId}|${weekday}`;
}

/**
 * The whole grid, row by row.
 *
 * A class is placed by its `periodId` when it has one. A class typed in before
 * this slice existed — or one that genuinely does not sit on the grid — has
 * none, and is matched to the period whose start time it shares instead, so
 * anything seeded by hand still appears in the right row rather than vanishing.
 * Anything that matches no row at all is returned separately; it is still on the
 * calendar, and the timetable says so rather than pretending it is not there.
 */
export function buildGrid(
  periods: TimetablePeriod[],
  classes: TimetableClass[],
  weekdays: readonly number[] = WEEKDAYS
): { rows: TimetableCell[][]; unplaced: TimetableClass[] } {
  const byStart = new Map<string, TimetablePeriod>();
  for (const period of periods) byStart.set(clockLabel(period.startsAt), period);

  const placed = new Map<string, TimetableClass[]>();
  const unplaced: TimetableClass[] = [];
  const periodIds = new Set(periods.map((period) => period.id));

  for (const item of classes) {
    const period =
      item.periodId && periodIds.has(item.periodId)
        ? periods.find((row) => row.id === item.periodId)
        : byStart.get(clockLabel(item.startsAt));

    if (!period || !weekdays.includes(item.weekday)) {
      unplaced.push(item);
      continue;
    }

    const key = cellKey(period.id, item.weekday);
    placed.set(key, [...(placed.get(key) ?? []), item]);
  }

  const rows = periods.map((period) =>
    weekdays.map((weekday) => ({
      period,
      weekday,
      classes: placed.get(cellKey(period.id, weekday)) ?? [],
    }))
  );

  return { rows, unplaced };
}
