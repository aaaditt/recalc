import { describe, expect, it } from 'vitest';

import {
  courseFromParam,
  dueLabel,
  filterFromParam,
  filterTasks,
  groupTasks,
  isOverdue,
} from './tasks';

// The arithmetic /tasks is built on. Two things on this screen can be silently
// wrong — which tasks a filter shows, and which local day a deadline lands on —
// and neither can be tested through a Server Component.

const DUBAI = 'Asia/Dubai'; // UTC+4, no DST.

// 10:00 Dubai on Monday 24 August 2026.
const NOW = new Date('2026-08-24T06:00:00Z');
const TODAY = '2026-08-24';

function task(
  id: string,
  dueAt: string | null,
  status = 'open',
  courseId: string | null = null
) {
  return { id, due_at: dueAt, status, course_id: courseId };
}

const options = { now: NOW, today: TODAY, timeZone: DUBAI };

describe('reading the URL', () => {
  it('falls back to open rather than throwing on a made-up filter', () => {
    expect(filterFromParam('overdue')).toBe('overdue');
    expect(filterFromParam('nonsense')).toBe('open');
    expect(filterFromParam(undefined)).toBe('open');
  });

  it('ignores a course that is not mine', () => {
    expect(courseFromParam('a', ['a', 'b'])).toBe('a');
    expect(courseFromParam('c', ['a', 'b'])).toBeNull();
    expect(courseFromParam(undefined, ['a'])).toBeNull();
  });
});

describe('filterTasks', () => {
  const late = task('late', '2026-08-20T05:00:00Z');
  const today = task('today', '2026-08-24T16:00:00Z');
  const soon = task('soon', '2026-08-28T05:00:00Z');
  const far = task('far', '2026-10-01T05:00:00Z');
  const undated = task('undated', null);
  const done = task('done', '2026-08-21T05:00:00Z', 'done');
  const dropped = task('dropped', null, 'dropped');
  const all = [late, today, soon, far, undated, done, dropped];

  function ids(filter: Parameters<typeof filterTasks>[1]['filter']) {
    return filterTasks(all, { ...options, filter, courseId: null }).map((t) => t.id);
  }

  it('open means everything still asking something of me, dated or not', () => {
    expect(ids('open')).toEqual(['late', 'today', 'soon', 'far', 'undated']);
  });

  it('overdue means late and still open — never something already finished', () => {
    expect(ids('overdue')).toEqual(['late']);
  });

  it('this week reaches seven days ahead and keeps what is already late', () => {
    // 2026-08-30 is day seven; 2026-10-01 is well past it.
    expect(ids('week')).toEqual(['late', 'today', 'soon']);
  });

  it('done shows finished and dropped, which is how a task is found again', () => {
    expect(ids('done')).toEqual(['done', 'dropped']);
  });

  it('all means all', () => {
    expect(ids('all')).toHaveLength(all.length);
  });

  it('narrows to one course without changing what the filter means', () => {
    const mine = task('mine', '2026-08-25T05:00:00Z', 'open', 'course-a');
    const theirs = task('theirs', '2026-08-25T05:00:00Z', 'open', 'course-b');

    const shown = filterTasks([mine, theirs], {
      ...options,
      filter: 'open',
      courseId: 'course-a',
    });
    expect(shown.map((t) => t.id)).toEqual(['mine']);
  });
});

describe('groupTasks', () => {
  it('splits late, dated, undated and finished, in that order of concern', () => {
    const grouped = groupTasks(
      [
        task('far', '2026-09-10T05:00:00Z'),
        task('late', '2026-03-01T05:00:00Z'),
        task('undated', null),
        task('done', '2026-08-01T05:00:00Z', 'done'),
        task('today', '2026-08-24T16:00:00Z'),
      ],
      { now: NOW, timeZone: DUBAI }
    );

    expect(grouped.overdue.map((t) => t.id)).toEqual(['late']);
    expect(grouped.days.map((day) => day.date)).toEqual(['2026-08-24', '2026-09-10']);
    expect(grouped.undated.map((t) => t.id)).toEqual(['undated']);
    expect(grouped.finished.map((t) => t.id)).toEqual(['done']);
  });

  it('looks back further than any window — a deadline from March is still late', () => {
    const ancient = task('ancient', '2026-03-02T05:00:00Z');
    const grouped = groupTasks([ancient], { now: NOW, timeZone: DUBAI });
    expect(grouped.overdue.map((t) => t.id)).toEqual(['ancient']);
  });

  it('groups by the local day, not the UTC day', () => {
    // 22:00 UTC on the 25th is 02:00 Dubai on the 26th. Reading it in UTC
    // would file this deadline a day early.
    const afterMidnight = task('late-night', '2026-08-25T22:00:00Z');

    expect(
      groupTasks([afterMidnight], { now: NOW, timeZone: DUBAI }).days[0].date
    ).toBe('2026-08-26');
    expect(groupTasks([afterMidnight], { now: NOW, timeZone: 'UTC' }).days[0].date).toBe(
      '2026-08-25'
    );
  });

  it('sorts the days, and the tasks inside a day', () => {
    const grouped = groupTasks(
      [
        task('wed-pm', '2026-08-26T14:00:00Z'),
        task('tue', '2026-08-25T09:00:00Z'),
        task('wed-am', '2026-08-26T05:00:00Z'),
      ],
      { now: NOW, timeZone: DUBAI }
    );

    expect(grouped.days.map((day) => day.tasks.map((t) => t.id))).toEqual([
      ['tue'],
      ['wed-am', 'wed-pm'],
    ]);
  });

  it('never puts a finished task in the overdue pile', () => {
    const grouped = groupTasks([task('done', '2026-01-01T05:00:00Z', 'done')], {
      now: NOW,
      timeZone: DUBAI,
    });
    expect(grouped.overdue).toEqual([]);
    expect(grouped.finished).toHaveLength(1);
  });
});

describe('isOverdue', () => {
  it('is measured against the minute, not the day', () => {
    // Due at 09:00 Dubai; it is 10:00.
    expect(isOverdue(task('a', '2026-08-24T05:00:00Z'), NOW)).toBe(true);
    // Due at 20:00 Dubai tonight.
    expect(isOverdue(task('b', '2026-08-24T16:00:00Z'), NOW)).toBe(false);
  });

  it('is never true of something undated or already finished', () => {
    expect(isOverdue(task('a', null), NOW)).toBe(false);
    expect(isOverdue(task('b', '2026-01-01T00:00:00Z', 'done'), NOW)).toBe(false);
  });
});

describe('dueLabel', () => {
  it('gives today and tomorrow a time, and anything further away a date', () => {
    const at = { today: TODAY, timeZone: DUBAI };
    expect(dueLabel('2026-08-24T16:00:00Z', at)).toBe('20:00');
    expect(dueLabel('2026-08-25T16:00:00Z', at)).toBe('Tomorrow 20:00');
    expect(dueLabel('2026-08-28T16:00:00Z', at)).toBe('Fri 28 Aug');
    expect(dueLabel(null, at)).toBe('—');
  });
});
