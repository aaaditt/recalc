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

// ---------------------------------------------------------------------------
// Optimistic edits — slice 19
// ---------------------------------------------------------------------------
//
// Adding a class is eleven sequential round trips to a database in Sydney. Slice
// 19 removed four of them; the rest are real work — an insert is an insert — and
// the only honest way to make the remainder feel like nothing is to draw the
// result before it is confirmed and then be scrupulous about taking it back.
//
// The whole reducer lives here rather than in the component for two reasons.
// One: it is arithmetic on a list, and the component should draw. Two: this
// project's test runner collects `lib/**` and `modules/**` and has no browser in
// it, so a rule that lives in a component is a rule with no test — and the rule
// below is one this product cannot get wrong.
//
// THE RULE: `applyPending` never mutates what it is given.
//
// React's `useOptimistic` reverts by re-rendering with the base state it was
// handed. If this function edited that array in place, a failed save would
// "revert" to an array that already contained the failure, and the grid would
// sit there showing a class the database does not have. That is the same bug
// this whole product exists to prevent — a screen that is confidently wrong —
// wearing a different hat. See lib/timetable.test.ts.

/** Marks a class the screen is showing but the database has not confirmed. */
export const PENDING_PREFIX = 'pending:';

/** Is this block drawn ahead of its save? */
export function isPending(item: TimetableClass): boolean {
  return item.sessionId.startsWith(PENDING_PREFIX);
}

/**
 * One edit in flight.
 *
 * `add` carries the whole block because the form already knows every field the
 * grid draws — the course, its colour, the room, the lab flag — so there is
 * nothing to wait for. `update` carries a patch. `remove` carries an id.
 */
export type PendingEdit =
  | { kind: 'add'; item: TimetableClass }
  | {
      kind: 'update';
      sessionId: string;
      patch: Partial<Pick<TimetableClass, 'code' | 'name' | 'colour' | 'courseId' | 'room' | 'isLab'>>;
    }
  | { kind: 'remove'; sessionId: string };

/**
 * The grid as it should look with one edit applied, without touching the grid
 * as it actually is.
 *
 * Written as the reducer `useOptimistic` wants: (state, action) -> state.
 */
export function applyPending(
  classes: readonly TimetableClass[],
  edit: PendingEdit
): TimetableClass[] {
  switch (edit.kind) {
    case 'add':
      return [...classes, edit.item];

    case 'remove':
      return classes.filter((item) => item.sessionId !== edit.sessionId);

    case 'update':
      return classes.map((item) =>
        item.sessionId === edit.sessionId ? { ...item, ...edit.patch } : item
      );
  }
}

/**
 * A block drawn before its row exists, built from what the form was given.
 *
 * The id is deliberately not a uuid: nothing may ever mistake it for a real
 * `sessions.id` and try to save against it, and if one of these ever reaches a
 * server action the error should be loud rather than a silent update of some
 * other row.
 */
export function pendingClass(fields: {
  periodId: string;
  weekday: number;
  courseId: string | null;
  code: string;
  name: string;
  colour: CourseColour;
  room: string;
  isLab: boolean;
  startsAt: string;
  endsAt: string;
}): TimetableClass {
  return {
    sessionId: `${PENDING_PREFIX}${fields.periodId}|${fields.weekday}`,
    courseId: fields.courseId ?? `${PENDING_PREFIX}course`,
    code: fields.code,
    name: fields.name,
    colour: fields.colour,
    room: fields.room.trim() === '' ? null : fields.room.trim(),
    isLab: fields.isLab,
    weekday: fields.weekday,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
    periodId: fields.periodId,
  };
}

/**
 * What a server action tells the grid.
 *
 * The three class actions return this instead of throwing, and the difference
 * matters: a thrown error in a server action reaches the nearest error boundary
 * and takes the whole screen with it, which is a strange punishment for a room
 * number that would not save. A result comes back to the component that asked,
 * the optimistic block disappears, and one line of text says why.
 *
 * `message` is meant to be read by a tired student, so it is a sentence rather
 * than a Postgres error — but it is never a lie about whether the save happened.
 */
export type SaveResult = { ok: true } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Two weeks side by side — slice 23
// ---------------------------------------------------------------------------
//
// The useful question is not "what are their classes", it is "when are we both
// free", and that is arithmetic on two lists. It lives here, pure and tested,
// for the same reason the optimistic reducer above does: the answer is a claim
// the screen makes to a person who is about to act on it, and a claim like that
// should not live somewhere it cannot be checked.

/** One of a friend's classes, as much of it as they let you see. */
export type FriendBlock = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  /** Null unless they share `full`. */
  code: string | null;
  room: string | null;
};

export type CompareCell = {
  period: TimetablePeriod;
  weekday: number;
  mine: TimetableClass[];
  theirs: FriendBlock[];
  /** Neither of you has anything in this slot. */
  bothFree: boolean;
};

/**
 * Your grid with a friend's week laid over it.
 *
 * Their classes are placed by start time and never by period id: the ids are
 * theirs, from their own grid, and two people can number their periods
 * differently. Anything of theirs that matches no row of yours comes back in
 * `unplaced` rather than being dropped — a class you cannot see the position of
 * is still a class they are in, and a "both free" that quietly ignored it would
 * be the screen lying about the one thing it is for.
 */
export function buildCompare(
  periods: TimetablePeriod[],
  mine: TimetableClass[],
  theirs: FriendBlock[],
  weekdays: readonly number[] = WEEKDAYS
): { rows: CompareCell[][]; unplaced: FriendBlock[] } {
  const byStart = new Map<string, TimetablePeriod>();
  for (const period of periods) byStart.set(clockLabel(period.startsAt), period);

  const placed = new Map<string, FriendBlock[]>();
  const unplaced: FriendBlock[] = [];

  for (const block of theirs) {
    const period = byStart.get(clockLabel(block.startsAt));
    if (!period || !weekdays.includes(block.weekday)) {
      unplaced.push(block);
      continue;
    }
    const key = cellKey(period.id, block.weekday);
    placed.set(key, [...(placed.get(key) ?? []), block]);
  }

  const ours = buildGrid(periods, mine, weekdays);

  const rows = ours.rows.map((row) =>
    row.map((cell) => {
      const friendBlocks = placed.get(cellKey(cell.period.id, cell.weekday)) ?? [];
      return {
        period: cell.period,
        weekday: cell.weekday,
        mine: cell.classes,
        theirs: friendBlocks,
        // "Both free" is only true when it is known to be true. A slot where
        // their sharing level tells you nothing is not a free slot, and this
        // function is never given the level — the caller does not draw the grid
        // at all when there is nothing to draw.
        bothFree: cell.classes.length === 0 && friendBlocks.length === 0,
      };
    })
  );

  return { rows, unplaced };
}
