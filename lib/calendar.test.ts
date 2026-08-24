import { describe, expect, it } from 'vitest';

import {
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
  MIN_MEETING_MINUTES,
  croppedHours,
  groupByDate,
  hoursIn,
  layoutDay,
  monthGrid,
  movedBy,
  resizedBy,
  sameMonth,
  snap,
  spanOfDay,
  startOfWeek,
  visibleDates,
  weekDates,
  weekTitle,
  type CalendarMeeting,
} from './calendar';
import { zonedToUtc, type CalendarDate } from './time';

// THE test for slice 04.
//
// The calendar has four ways to be silently wrong, and all four are arithmetic
// that no amount of looking at the screen will catch on the one week where it
// happens to be right:
//
//   1. rendering 00:00-23:59 instead of the cropped range
//   2. showing five columns on a week that has a Saturday class
//   3. hiding one of two overlapping classes behind the other
//   4. moving or resizing one meeting and changing another
//
// Fixed dates, fixed zone. Asia/Dubai is UTC+4 all year, so nothing here
// drifts with the calendar or with daylight saving.

const ZONE = 'Asia/Dubai';

// 2026-08-24 is a Monday.
const MON = '2026-08-24';
const TUE = '2026-08-25';
const SAT = '2026-08-29';

let nextId = 0;

function meeting(date: CalendarDate, from: string, to: string): CalendarMeeting {
  nextId += 1;
  return {
    id: `m${nextId}`,
    courseId: 'c1',
    code: 'ME301',
    name: 'Thermodynamics',
    colour: 'indigo',
    room: 'B204',
    startsAt: zonedToUtc(date, from, ZONE).toISOString(),
    endsAt: zonedToUtc(date, to, ZONE).toISOString(),
    cancelled: false,
  };
}

// ---------------------------------------------------------------------------

describe('weeks', () => {
  it('starts a week on Monday, wherever in it you point', () => {
    expect(startOfWeek(MON)).toBe(MON);
    expect(startOfWeek('2026-08-27')).toBe(MON);
    expect(startOfWeek('2026-08-30')).toBe(MON); // Sunday belongs to the week before
  });

  it('gives seven dates, Monday first', () => {
    const dates = weekDates('2026-08-27');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe(MON);
    expect(dates[6]).toBe('2026-08-30');
  });

  it('titles a week, and says both months when it straddles two', () => {
    expect(weekTitle(weekDates(MON))).toBe('24–30 August 2026');
    expect(weekTitle(weekDates('2026-08-31'))).toBe('31 August – 6 September 2026');
  });
});

describe('columns', () => {
  const weekdayClass = meeting(TUE, '09:00', '10:30');
  const saturdayClass = meeting(SAT, '09:00', '10:30');

  it('shows five columns when nothing falls on a weekend', () => {
    const byDate = groupByDate([weekdayClass], (m) => m.startsAt, ZONE);
    const dates = visibleDates(weekDates(MON), byDate);

    expect(dates).toHaveLength(5);
    expect(dates).not.toContain(SAT);
  });

  it('shows seven the moment one does', () => {
    const byDate = groupByDate([weekdayClass, saturdayClass], (m) => m.startsAt, ZONE);
    const dates = visibleDates(weekDates(MON), byDate);

    expect(dates).toHaveLength(7);
    expect(dates).toContain(SAT);
  });
});

describe('the cropped time range', () => {
  it('never renders a full day when there is anything to show', () => {
    const dates = weekDates(MON);
    const meetings = [meeting(TUE, '09:00', '10:30')];

    const range = croppedHours(meetings, dates, ZONE);

    expect(range).toEqual({ startHour: 8, endHour: 12 });
    expect(range.endHour - range.startHour).toBeLessThan(24);
  });

  it('pads exactly one hour either side of the earliest and latest class', () => {
    const dates = weekDates(MON);
    const meetings = [meeting(MON, '11:00', '12:00'), meeting(TUE, '14:00', '15:30')];

    expect(croppedHours(meetings, dates, ZONE)).toEqual({ startHour: 10, endHour: 17 });
  });

  it('ignores classes outside the dates on screen', () => {
    const meetings = [meeting(MON, '08:00', '09:00'), meeting(SAT, '20:00', '22:00')];

    // Monday to Friday only: Saturday's late class must not stretch the grid.
    const weekdaysOnly = weekDates(MON).slice(0, 5);
    expect(croppedHours(meetings, weekdaysOnly, ZONE)).toEqual({
      startHour: 7,
      endHour: 10,
    });
  });

  it('clamps at midnight rather than padding past it', () => {
    const meetings = [meeting(MON, '00:00', '01:00'), meeting(MON, '22:30', '23:45')];
    expect(croppedHours(meetings, [MON], ZONE)).toEqual({ startHour: 0, endHour: 24 });
  });

  it('falls back to a working day when the week is empty', () => {
    expect(croppedHours([], weekDates(MON), ZONE)).toEqual({
      startHour: DEFAULT_START_HOUR,
      endHour: DEFAULT_END_HOUR,
    });
  });

  it('draws one gutter label per hour', () => {
    expect(hoursIn({ startHour: 8, endHour: 12 })).toEqual([8, 9, 10, 11]);
  });
});

describe('where a block sits', () => {
  it('measures from the local midnight of the day it is drawn on', () => {
    expect(spanOfDay(meeting(TUE, '09:00', '10:30'), TUE, ZONE)).toEqual({
      startMinute: 540,
      endMinute: 630,
    });
  });

  it('is null on a day the meeting does not touch', () => {
    expect(spanOfDay(meeting(TUE, '09:00', '10:30'), MON, ZONE)).toBeNull();
  });

  it('clips a class that runs past midnight instead of wrapping it', () => {
    const late = meeting(MON, '23:00', '23:59');
    const overnight = {
      startsAt: late.startsAt,
      endsAt: zonedToUtc(TUE, '01:00', ZONE).toISOString(),
    };

    expect(spanOfDay(overnight, MON, ZONE)).toEqual({ startMinute: 1380, endMinute: 1440 });
    expect(spanOfDay(overnight, TUE, ZONE)).toEqual({ startMinute: 0, endMinute: 60 });
  });
});

describe('overlaps', () => {
  it('puts two classes at the same hour side by side, and hides neither', () => {
    const a = meeting(TUE, '09:00', '10:30');
    const b = meeting(TUE, '09:30', '11:00');

    const placed = layoutDay([a, b], TUE, ZONE);

    expect(placed).toHaveLength(2);
    expect(placed.every((entry) => entry.columns === 2)).toBe(true);
    expect(placed.map((entry) => entry.column).sort()).toEqual([0, 1]);
  });

  it('leaves a class that clashes with nothing at full width', () => {
    const placed = layoutDay(
      [meeting(TUE, '09:00', '10:00'), meeting(TUE, '11:00', '12:00')],
      TUE,
      ZONE
    );

    expect(placed.map((entry) => entry.columns)).toEqual([1, 1]);
  });

  it('splits only the cluster that clashes, not the whole day', () => {
    const placed = layoutDay(
      [
        meeting(TUE, '09:00', '10:30'),
        meeting(TUE, '09:30', '11:00'),
        meeting(TUE, '14:00', '15:00'),
      ],
      TUE,
      ZONE
    );

    const widths = placed.map((entry) => entry.columns);
    expect(widths).toEqual([2, 2, 1]);
  });

  it('reuses a column once its block has finished', () => {
    // Back-to-back classes touch but do not overlap, so the second takes the
    // first's column rather than a new one.
    const placed = layoutDay(
      [meeting(TUE, '09:00', '10:00'), meeting(TUE, '10:00', '11:00')],
      TUE,
      ZONE
    );

    expect(placed.map((entry) => entry.column)).toEqual([0, 0]);
    expect(placed.map((entry) => entry.columns)).toEqual([1, 1]);
  });

  it('places every meeting it is given', () => {
    const meetings = [
      meeting(TUE, '09:00', '11:00'),
      meeting(TUE, '09:00', '10:00'),
      meeting(TUE, '10:00', '11:00'),
      meeting(MON, '09:00', '10:00'),
    ];

    const placed = layoutDay(meetings, TUE, ZONE);
    expect(placed).toHaveLength(3);
    expect(new Set(placed.map((entry) => entry.item.id)).size).toBe(3);
  });
});

describe('dragging one meeting', () => {
  const original = meeting(TUE, '09:00', '10:30');

  it('snaps to the quarter hour', () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(-8)).toBe(-15);
    expect(snap(38)).toBe(45);
  });

  it('keeps a moved meeting the same length', () => {
    const moved = movedBy(original, 60);
    const length = (from: { startsAt: string; endsAt: string }) =>
      new Date(from.endsAt).getTime() - new Date(from.startsAt).getTime();

    expect(length(moved)).toBe(length(original));
    expect(new Date(moved.startsAt).getTime() - new Date(original.startsAt).getTime()).toBe(
      3_600_000
    );
  });

  it('leaves the start alone when resizing, and will not go below the floor', () => {
    const shrunk = resizedBy(original, -600);

    expect(shrunk.startsAt).toBe(original.startsAt);
    expect(new Date(shrunk.endsAt).getTime() - new Date(shrunk.startsAt).getTime()).toBe(
      MIN_MEETING_MINUTES * 60_000
    );
  });

  it('returns new instants and mutates nothing', () => {
    const before = { ...original };
    movedBy(original, 30);
    resizedBy(original, 30);
    expect(original).toEqual(before);
  });
});

describe('the month grid', () => {
  it('is six Monday-first rows of seven', () => {
    const grid = monthGrid('2026-08-24');

    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(startOfWeek(grid[0][0])).toBe(grid[0][0]);
  });

  it('covers every day of its month', () => {
    const grid = monthGrid('2026-08-24').flat();

    expect(grid).toContain('2026-08-01');
    expect(grid).toContain('2026-08-31');
    expect(grid.filter((date) => sameMonth(date, '2026-08-01'))).toHaveLength(31);
  });
});
