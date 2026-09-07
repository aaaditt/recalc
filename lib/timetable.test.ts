import { describe, it, expect } from 'vitest';

import {
  applyPending,
  buildGrid,
  cellKey,
  isPending,
  pendingClass,
  PENDING_PREFIX,
  type PendingEdit,
  type TimetableClass,
  type TimetablePeriod,
} from '@/lib/timetable';

// THE test for slice 19.
//
// The slice makes /timetable draw a class the instant it is typed, before the
// database ~606ms away has confirmed anything. That is a promise that the screen
// will be corrected when the save fails — and the mechanism that corrects it is
// React's `useOptimistic`, which reverts by re-rendering with the base state it
// was originally handed.
//
// So the whole of "a failed save visibly rolls the cell back" rests on one
// property of one function: `applyPending` must never touch what it is given. If
// it did, the state React reverts *to* would already contain the failed edit,
// and the grid would sit there showing a class that does not exist — confidently
// wrong, which is the one thing this product is built not to be.
//
// There is no browser in this test runner and no React here. That is deliberate
// rather than a limitation: the rule is arithmetic on a list, so it is proved as
// arithmetic on a list, and it cannot be broken by a later change to how the
// grid is drawn.

const PERIOD_ONE: TimetablePeriod = {
  id: 'period-1',
  label: '1',
  startsAt: '07:30:00',
  endsAt: '08:20:00',
};
const PERIOD_TWO: TimetablePeriod = {
  id: 'period-2',
  label: '2',
  startsAt: '08:20:00',
  endsAt: '09:10:00',
};
const TUESDAY = 2;

function saved(over: Partial<TimetableClass> = {}): TimetableClass {
  return {
    sessionId: 'session-a',
    courseId: 'course-a',
    code: 'MA201',
    name: 'Linear Algebra',
    colour: 'indigo',
    room: 'B-14',
    isLab: false,
    weekday: TUESDAY,
    startsAt: '07:30:00',
    endsAt: '08:20:00',
    periodId: PERIOD_ONE.id,
    ...over,
  };
}

/** A deep snapshot, so mutation of a nested object is caught as well as of the array. */
function snapshot(classes: readonly TimetableClass[]): string {
  return JSON.stringify(classes);
}

describe('the grid never keeps a class the database refused', () => {
  it('leaves the saved list untouched when a class is added optimistically', () => {
    const classes = [saved()];
    const before = snapshot(classes);

    const next = applyPending(classes, {
      kind: 'add',
      item: pendingClass({
        periodId: PERIOD_TWO.id,
        weekday: TUESDAY,
        courseId: 'course-b',
        code: 'PH101',
        name: 'Mechanics',
        colour: 'amber',
        room: 'Lab 2',
        isLab: true,
        startsAt: PERIOD_TWO.startsAt,
        endsAt: PERIOD_TWO.endsAt,
      }),
    });

    // The optimistic view has it...
    expect(next).toHaveLength(2);
    // ...and the state React would revert to does not, byte for byte.
    expect(snapshot(classes)).toBe(before);
    expect(next).not.toBe(classes);
  });

  it('leaves the saved list untouched when a class is removed optimistically', () => {
    const classes = [saved(), saved({ sessionId: 'session-b', code: 'CS110' })];
    const before = snapshot(classes);

    const next = applyPending(classes, { kind: 'remove', sessionId: 'session-a' });

    expect(next.map((item) => item.sessionId)).toEqual(['session-b']);
    expect(snapshot(classes)).toBe(before);
  });

  it('leaves the saved list untouched when a class is edited optimistically', () => {
    const classes = [saved()];
    const before = snapshot(classes);

    const next = applyPending(classes, {
      kind: 'update',
      sessionId: 'session-a',
      patch: { room: 'C-01', isLab: true },
    });

    expect(next[0].room).toBe('C-01');
    expect(next[0].isLab).toBe(true);
    // The nested object was copied, not edited in place.
    expect(next[0]).not.toBe(classes[0]);
    expect(snapshot(classes)).toBe(before);
  });

  it('returns exactly the original grid when every edit in flight is dropped', () => {
    // What a failed save is, in this model: the edits go away and the base state
    // is drawn again. It has to be the same grid, not an equivalent one.
    const classes = [saved(), saved({ sessionId: 'session-b', periodId: PERIOD_TWO.id })];
    const before = snapshot(classes);

    const edits: PendingEdit[] = [
      { kind: 'add', item: pendingClass({
        periodId: PERIOD_TWO.id,
        weekday: 3,
        courseId: 'course-b',
        code: 'PH101',
        name: 'Mechanics',
        colour: 'amber',
        room: '',
        isLab: false,
        startsAt: PERIOD_TWO.startsAt,
        endsAt: PERIOD_TWO.endsAt,
      }) },
      { kind: 'remove', sessionId: 'session-a' },
      { kind: 'update', sessionId: 'session-b', patch: { room: 'gone' } },
    ];
    edits.reduce(applyPending, classes as TimetableClass[]);

    expect(snapshot(classes)).toBe(before);
    expect(buildGrid([PERIOD_ONE, PERIOD_TWO], classes).rows.flat()
      .filter((cell) => cell.classes.length > 0)).toHaveLength(2);
  });
});

describe('an optimistic class is drawn in the cell that was clicked', () => {
  it('lands in the right row and column, and is marked as not yet saved', () => {
    const item = pendingClass({
      periodId: PERIOD_TWO.id,
      weekday: TUESDAY,
      courseId: 'course-b',
      code: 'PH101',
      name: 'Mechanics',
      colour: 'amber',
      room: '  Lab 2  ',
      isLab: true,
      startsAt: PERIOD_TWO.startsAt,
      endsAt: PERIOD_TWO.endsAt,
    });

    const { rows, unplaced } = buildGrid([PERIOD_ONE, PERIOD_TWO], [item]);
    const cells = new Map(
      rows.flat().map((cell) => [cellKey(cell.period.id, cell.weekday), cell])
    );

    expect(unplaced).toHaveLength(0);
    expect(cells.get(cellKey(PERIOD_TWO.id, TUESDAY))?.classes).toEqual([item]);
    expect(cells.get(cellKey(PERIOD_ONE.id, TUESDAY))?.classes).toEqual([]);
    expect(item.room).toBe('Lab 2');
  });

  it('cannot be mistaken for a saved class', () => {
    const item = pendingClass({
      periodId: PERIOD_ONE.id,
      weekday: TUESDAY,
      courseId: null,
      code: 'NEW',
      name: 'A course typed just now',
      colour: 'indigo',
      room: '',
      isLab: false,
      startsAt: PERIOD_ONE.startsAt,
      endsAt: PERIOD_ONE.endsAt,
    });

    // A temporary id must never look like a `sessions.id`, so that sending one
    // to a server action fails loudly instead of updating some other row.
    expect(isPending(item)).toBe(true);
    expect(item.sessionId.startsWith(PENDING_PREFIX)).toBe(true);
    expect(item.sessionId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(isPending(saved())).toBe(false);
    expect(item.room).toBeNull();
  });
});
