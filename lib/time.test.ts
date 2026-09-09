import { describe, it, expect, afterEach } from 'vitest';
import {
  dayRangeUtc,
  eachDate,
  localDateKey,
  localTimeLabel,
  localTimeZone,
  shiftDate,
  weekdayOf,
  zonedToUtc,
} from '@/lib/time';

// Pure, no database. Timezone maths is where meeting generation would go wrong
// silently, so it gets its own cheap test.

describe('zonedToUtc', () => {
  it('reads a wall-clock time in a zone with no DST', () => {
    // Asia/Dubai is UTC+4 all year.
    expect(zonedToUtc('2026-10-06', '09:00', 'Asia/Dubai').toISOString()).toBe(
      '2026-10-06T05:00:00.000Z'
    );
    expect(zonedToUtc('2026-10-06', '09:00:00', 'Asia/Dubai').toISOString()).toBe(
      '2026-10-06T05:00:00.000Z'
    );
  });

  it('handles a half-hour offset', () => {
    // Asia/Kolkata is UTC+5:30.
    expect(zonedToUtc('2026-10-06', '09:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-06T03:30:00.000Z'
    );
  });

  it('picks the right side of a DST change', () => {
    // Europe/London: BST (UTC+1) in July, GMT (UTC+0) in December.
    expect(zonedToUtc('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe(
      '2026-07-01T08:00:00.000Z'
    );
    expect(zonedToUtc('2026-12-01', '09:00', 'Europe/London').toISOString()).toBe(
      '2026-12-01T09:00:00.000Z'
    );
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => zonedToUtc('6 Oct 2026', '09:00', 'Asia/Dubai')).toThrow();
  });
});

describe('reading instants back', () => {
  it('reports the local day and time an instant falls on', () => {
    const instant = new Date('2026-10-06T21:30:00.000Z');
    expect(localDateKey(instant, 'Asia/Dubai')).toBe('2026-10-07');
    expect(localTimeLabel(instant, 'Asia/Dubai')).toBe('01:30');
    expect(localDateKey(instant, 'UTC')).toBe('2026-10-06');
  });

  it('gives a half-open range for a local day', () => {
    expect(dayRangeUtc('2026-10-06', 'Asia/Dubai')).toEqual({
      startsAt: '2026-10-05T20:00:00.000Z',
      endsAt: '2026-10-06T20:00:00.000Z',
    });
  });
});

describe('calendar dates', () => {
  it('numbers weekdays 0=Sun .. 6=Sat', () => {
    expect(weekdayOf('2026-10-04')).toBe(0); // Sunday
    expect(weekdayOf('2026-10-06')).toBe(2); // Tuesday
    expect(weekdayOf('2026-10-10')).toBe(6); // Saturday
  });

  it('shifts across month ends', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists a range inclusively', () => {
    expect(eachDate('2026-10-06', '2026-10-08')).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    expect(eachDate('2026-10-08', '2026-10-06')).toEqual([]);
  });
});


// The bug this guards against shipped, and could only ever appear in
// production: every page that asks the time is a Server Component, so on
// Vercel the "machine" is a container running in UTC, and the whole 07:30
// timetable drew at 03:30. See lib/time.ts's note on localTimeZone.
describe('localTimeZone', () => {
  const original = process.env.NEXT_PUBLIC_APP_TIME_ZONE;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_TIME_ZONE;
    else process.env.NEXT_PUBLIC_APP_TIME_ZONE = original;
  });

  it('prefers the configured campus zone over the machine', () => {
    process.env.NEXT_PUBLIC_APP_TIME_ZONE = 'Asia/Dubai';
    expect(localTimeZone()).toBe('Asia/Dubai');
  });

  it('keeps the campus zone even when the machine is UTC, which is Vercel', () => {
    process.env.NEXT_PUBLIC_APP_TIME_ZONE = 'Asia/Dubai';
    // The first period, as an instant: 07:30 in Dubai is 03:30Z.
    const firstPeriod = new Date('2026-09-09T03:30:00Z');
    expect(localTimeLabel(firstPeriod, localTimeZone())).toBe('07:30');
  });

  it('falls back to the machine when unset', () => {
    delete process.env.NEXT_PUBLIC_APP_TIME_ZONE;
    expect(localTimeZone()).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
  });

  it('falls back rather than throwing on a misspelt zone', () => {
    process.env.NEXT_PUBLIC_APP_TIME_ZONE = 'Asia/Dubai_typo';
    expect(() => localTimeZone()).not.toThrow();
    expect(localTimeZone()).not.toBe('Asia/Dubai_typo');
  });

  it('ignores an empty value, which is what an unfilled dashboard field sends', () => {
    process.env.NEXT_PUBLIC_APP_TIME_ZONE = '   ';
    expect(localTimeZone()).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
  });
});
