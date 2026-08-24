import { describe, expect, it } from 'vitest';

import {
  classStates,
  formatDate,
  formatDayLabel,
  formatShortDate,
  groupTasksByDay,
} from './today';

// The invariant of slice 03:
//
//   /today tells the truth about *when*.
//
// One class is highlighted and it is the one I am in (or the one I am about to
// be in); anything already late is separated out and shown first; and a
// deadline lands on the day it lands on in my timezone, not the server's.
//
// The page is a Server Component with no logic of its own — all of it is here,
// so all of it is testable without a database.

const DUBAI = 'Asia/Dubai'; // UTC+4, no DST — the term's timezone.

function meeting(startsAt: string, endsAt: string, status = 'scheduled') {
  return { starts_at: startsAt, ends_at: endsAt, status };
}

function task(dueAt: string | null, status = 'open') {
  return { due_at: dueAt, status };
}

// ---------------------------------------------------------------------------

describe('classStates', () => {
  // A day with three lectures: 09:00, 11:00 and 14:00 Dubai time.
  const day = [
    meeting('2026-08-24T05:00:00Z', '2026-08-24T06:30:00Z'),
    meeting('2026-08-24T07:00:00Z', '2026-08-24T08:30:00Z'),
    meeting('2026-08-24T10:00:00Z', '2026-08-24T11:00:00Z'),
  ];

  it('marks the class I am sitting in, and nothing else', () => {
    // 11:30 Dubai — the middle lecture is running.
    const states = classStates(day, new Date('2026-08-24T07:30:00Z'));
    expect(states).toEqual(['past', 'now', 'later']);
  });

  it('marks the next class when none is running', () => {
    // 10:45 Dubai — the first has finished, the second has not started.
    const states = classStates(day, new Date('2026-08-24T06:45:00Z'));
    expect(states).toEqual(['past', 'next', 'later']);
  });

  it('never marks two classes', () => {
    for (const hour of ['04:00', '05:00', '06:45', '07:30', '10:30', '13:00']) {
      const states = classStates(day, new Date(`2026-08-24T${hour}:00Z`));
      const highlighted = states.filter((s) => s === 'now' || s === 'next');
      expect(highlighted.length, `at ${hour}Z`).toBeLessThanOrEqual(1);
    }
  });

  it('marks everything past once the day is over', () => {
    const states = classStates(day, new Date('2026-08-24T18:00:00Z'));
    expect(states).toEqual(['past', 'past', 'past']);
  });

  it('a class starting exactly now is on, not next', () => {
    const states = classStates(day, new Date('2026-08-24T07:00:00Z'));
    expect(states[1]).toBe('now');
  });

  it('a class ending exactly now is past', () => {
    const states = classStates(day, new Date('2026-08-24T06:30:00Z'));
    expect(states[0]).toBe('past');
  });

  it('never highlights a cancelled class', () => {
    const cancelled = [
      meeting('2026-08-24T05:00:00Z', '2026-08-24T06:30:00Z', 'cancelled'),
      meeting('2026-08-24T07:00:00Z', '2026-08-24T08:30:00Z'),
    ];

    // 09:30 Dubai: the cancelled lecture would be "now" if it were happening.
    expect(classStates(cancelled, new Date('2026-08-24T05:30:00Z'))).toEqual([
      'later',
      'next',
    ]);

    // And before the day starts it is not "next" either.
    expect(classStates(cancelled, new Date('2026-08-24T03:00:00Z'))).toEqual([
      'later',
      'next',
    ]);
  });

  it('says nothing about a day with no classes', () => {
    expect(classStates([], new Date())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('groupTasksByDay', () => {
  // 10:00 Dubai on Monday 24 August 2026.
  const now = new Date('2026-08-24T06:00:00Z');
  const options = { now, today: '2026-08-24', timeZone: DUBAI };

  it('separates what is already late', () => {
    const late = task('2026-08-24T05:00:00Z'); // 09:00 Dubai, an hour ago
    const soon = task('2026-08-24T16:00:00Z'); // 20:00 Dubai, tonight

    const grouped = groupTasksByDay([soon, late], options);
    expect(grouped.overdue).toEqual([late]);
    expect(grouped.days).toEqual([{ date: '2026-08-24', tasks: [soon] }]);
  });

  it('sorts overdue oldest first', () => {
    const older = task('2026-08-20T05:00:00Z');
    const newer = task('2026-08-23T05:00:00Z');

    expect(groupTasksByDay([newer, older], options).overdue).toEqual([older, newer]);
  });

  it('groups by the local day, not the UTC day', () => {
    // 22:00 UTC on the 25th is 02:00 Dubai on the 26th. Reading it in UTC
    // would file this deadline a day early — the exact mistake this test is
    // here to catch.
    const afterMidnight = task('2026-08-25T22:00:00Z');

    expect(groupTasksByDay([afterMidnight], options).days).toEqual([
      { date: '2026-08-26', tasks: [afterMidnight] },
    ]);
    expect(groupTasksByDay([afterMidnight], { ...options, timeZone: 'UTC' }).days).toEqual([
      { date: '2026-08-25', tasks: [afterMidnight] },
    ]);
  });

  it('orders the days, and the tasks inside a day', () => {
    const wedEvening = task('2026-08-26T14:00:00Z');
    const wedMorning = task('2026-08-26T05:00:00Z');
    const tuesday = task('2026-08-25T09:00:00Z');

    const grouped = groupTasksByDay([wedEvening, tuesday, wedMorning], options);
    expect(grouped.days).toEqual([
      { date: '2026-08-25', tasks: [tuesday] },
      { date: '2026-08-26', tasks: [wedMorning, wedEvening] },
    ]);
  });

  it('stops at the end of the window', () => {
    const inside = task('2026-08-30T09:00:00Z'); // day 7
    const outside = task('2026-08-31T09:00:00Z'); // day 8

    const grouped = groupTasksByDay([inside, outside], options);
    expect(grouped.days.map((day) => day.date)).toEqual(['2026-08-30']);
  });

  it('ignores finished, abandoned and undated tasks', () => {
    const grouped = groupTasksByDay(
      [
        task('2026-08-24T05:00:00Z', 'done'),
        task('2026-08-25T05:00:00Z', 'done'),
        task('2026-08-25T05:00:00Z', 'dropped'),
        task(null),
      ],
      options
    );

    expect(grouped.overdue).toEqual([]);
    expect(grouped.days).toEqual([]);
  });

  it('keeps a task that has been started', () => {
    const doing = task('2026-08-25T05:00:00Z', 'doing');
    expect(groupTasksByDay([doing], options).days[0].tasks).toEqual([doing]);
  });
});

// ---------------------------------------------------------------------------

describe('date labels', () => {
  it('names today and tomorrow rather than dating them', () => {
    expect(formatDayLabel('2026-08-24', '2026-08-24')).toBe('Today');
    expect(formatDayLabel('2026-08-25', '2026-08-24')).toBe('Tomorrow');
    expect(formatDayLabel('2026-08-26', '2026-08-24')).toBe('Wednesday 26 August');
  });

  it('formats a calendar date without shifting it', () => {
    expect(formatDate('2026-08-24')).toBe('Monday 24 August');
    expect(formatShortDate('2026-08-22')).toBe('Sat 22 Aug');
    // Midnight on the 1st is the trap: any accidental timezone maths sends it
    // back to the previous month.
    expect(formatDate('2026-09-01')).toBe('Tuesday 1 September');
  });
});
