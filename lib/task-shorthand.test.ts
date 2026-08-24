import { describe, expect, it } from 'vitest';

import { parseTaskShorthand, shorthandDueAt } from './task-shorthand';

// Quick add has one job and one failure mode: it must never quietly eat a word
// of the title, and it must never quietly invent a deadline. Both are here.
//
// `now` is built with the local Date constructor rather than an ISO string, so
// these tests mean the same thing whatever zone the machine is set to — which
// is the point, since the parser runs in the browser and is deliberately local.

// Monday 24 August 2026, 10:00 local.
const NOW = new Date(2026, 7, 24, 10, 0);

const COURSES = [
  { id: 'course-me301', code: 'ME301' },
  { id: 'course-ma204', code: 'MA204' },
];

function parse(input: string) {
  return parseTaskShorthand(input, { now: NOW, courses: COURSES });
}

describe('what it understands', () => {
  it('reads a weekday and a time off the end', () => {
    const parsed = parse('Thermo problem set fri 5pm');
    expect(parsed.title).toBe('Thermo problem set');
    expect(parsed.dueDate).toBe('2026-08-28');
    expect(parsed.dueTime).toBe('17:00');
    expect(parsed.timeWasTyped).toBe(true);
  });

  it('takes the time and the date in either order', () => {
    expect(parse('Essay 5pm fri').dueDate).toBe('2026-08-28');
    expect(parse('Essay 5pm fri').dueTime).toBe('17:00');
  });

  it('ends a dated task at the end of that day when no time was typed', () => {
    const parsed = parse('Lab report tuesday');
    expect(parsed.dueDate).toBe('2026-08-25');
    expect(parsed.dueTime).toBe('23:59');
    expect(parsed.timeWasTyped).toBe(false);
  });

  it('reads today, tomorrow and tonight', () => {
    expect(parse('Reading today').dueDate).toBe('2026-08-24');
    expect(parse('Reading tomorrow').dueDate).toBe('2026-08-25');
    expect(parse('Reading tonight')).toMatchObject({
      dueDate: '2026-08-24',
      dueTime: '20:00',
    });
  });

  it('treats the weekday I am on as today, not next week', () => {
    // NOW is a Monday. "mon" means tonight, not a week from tonight.
    expect(parse('Standup mon').dueDate).toBe('2026-08-24');
    // "next mon" is the one that means a week away.
    expect(parse('Standup next mon').dueDate).toBe('2026-08-31');
  });

  it('reads dates written out, slashed and ISO', () => {
    expect(parse('Essay 28 aug').dueDate).toBe('2026-08-28');
    expect(parse('Essay aug 28').dueDate).toBe('2026-08-28');
    expect(parse('Essay 28th aug').dueDate).toBe('2026-08-28');
    expect(parse('Essay 28/8').dueDate).toBe('2026-08-28');
    expect(parse('Essay 28/08/2026').dueDate).toBe('2026-08-28');
    expect(parse('Essay 2026-09-01').dueDate).toBe('2026-09-01');
  });

  it('reads a bare day-and-month as the coming one, not the one that has gone', () => {
    // 3 January has already passed in 2026, so it means January 2027.
    expect(parse('Exam 3 jan').dueDate).toBe('2027-01-03');
  });

  it('reads several ways of writing a time', () => {
    expect(parse('Call 17:00').dueTime).toBe('17:00');
    expect(parse('Call 5.30pm').dueTime).toBe('17:30');
    expect(parse('Call 9am').dueTime).toBe('09:00');
    expect(parse('Call noon').dueTime).toBe('12:00');
    expect(parse('Call midnight').dueTime).toBe('00:00');
    expect(parse('Call 5 pm').dueTime).toBe('17:00');
  });

  it('puts a time with no day on today, or tomorrow once it has passed', () => {
    // 10:00 now: 5pm is still ahead, 9am is not.
    expect(parse('Call 5pm').dueDate).toBe('2026-08-24');
    expect(parse('Call 9am').dueDate).toBe('2026-08-25');
  });

  it('drops the joining word in front of a date', () => {
    expect(parse('Hand in the essay by friday').title).toBe('Hand in the essay');
    expect(parse('Revise unit 3 before tuesday').title).toBe('Revise unit 3');
    expect(parse('Seminar on 28 aug').title).toBe('Seminar');
  });

  it('matches a course code anywhere in the line', () => {
    expect(parse('ME301 problem set fri')).toMatchObject({
      title: 'problem set',
      courseId: 'course-me301',
      courseCode: 'ME301',
    });
    expect(parse('problem set me301 fri').title).toBe('problem set');
    expect(parse('problem set me301 fri').courseId).toBe('course-me301');
  });
});

describe('what it refuses to invent', () => {
  it('gives a task with no date words no deadline at all', () => {
    const parsed = parse('Email the department about the lab slot');
    expect(parsed.dueDate).toBeNull();
    expect(parsed.title).toBe('Email the department about the lab slot');
    expect(shorthandDueAt(parsed)).toBeNull();
  });

  it('does not read a bare number as a time', () => {
    // The single most likely way to lose half a title.
    expect(parse('Read chapter 5').title).toBe('Read chapter 5');
    expect(parse('Read chapter 5').dueDate).toBeNull();
    expect(parse('Problem set 3').title).toBe('Problem set 3');
  });

  it('does not eat the only word there is', () => {
    // "friday" on its own is the title, not an empty task due Friday.
    expect(parse('friday').title).toBe('friday');
    // Nor is a lone course code swallowed into a nameless task.
    expect(parse('ME301').title).toBe('ME301');
    expect(parse('ME301').courseId).toBeNull();
  });

  it('rejects nonsense times rather than rounding them', () => {
    expect(parse('Call 13pm').dueDate).toBeNull();
    expect(parse('Call 10:75').dueDate).toBeNull();
  });

  it('takes at most one date and one time', () => {
    // "mon tue" — the later token wins and the earlier stays in the title,
    // rather than two dates silently fighting.
    const parsed = parse('Thing mon tue');
    expect(parsed.dueDate).toBe('2026-08-25');
    expect(parsed.title).toBe('Thing mon');
  });

  it('gives an empty line an empty title and no date', () => {
    expect(parse('   ')).toMatchObject({ title: '', dueDate: null });
  });
});

describe('shorthandDueAt', () => {
  it('turns the parsed day and time into the instant it names locally', () => {
    const parsed = parse('Essay fri 5pm');
    const at = new Date(shorthandDueAt(parsed) as string);

    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(7);
    expect(at.getDate()).toBe(28);
    expect(at.getHours()).toBe(17);
    expect(at.getMinutes()).toBe(0);
  });
});
