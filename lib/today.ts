// The arithmetic behind /today, kept out of the page so it can be tested
// without a database.
//
// Nothing here imports a module: it works on the shape of a meeting and the
// shape of a task, which is enough to answer the two questions the page asks —
// "which class am I in?" and "what is late?".

import { localDateKey, shiftDate, type CalendarDate } from './time';

/** How many days of deadlines /today shows, counting today. */
export const DUE_WINDOW_DAYS = 7;

/**
 * How far back /today looks for something already late. A task older than this
 * is not forgotten — it is simply not this screen's job, and a Today page that
 * opens onto four months of guilt is a Today page that stops being opened.
 */
export const OVERDUE_LOOKBACK_DAYS = 30;

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/**
 * `now`   — happening at this minute.
 * `next`  — the one starting next, when nothing is happening now.
 * `past`  — already finished.
 * `later` — still to come, but not next.
 */
export type ClassState = 'past' | 'now' | 'next' | 'later';

type MeetingLike = {
  starts_at: string;
  ends_at: string;
  status: string;
};

/**
 * Label each of today's meetings, in the order they were given (earliest
 * first). Exactly one meeting is ever `now` or `next`, never both and never
 * two: the page highlights one class, because two highlights is none.
 *
 * A cancelled class is never the one highlighted — it is not somewhere to be.
 */
export function classStates(meetings: readonly MeetingLike[], now: Date): ClassState[] {
  const at = now.getTime();

  const states: ClassState[] = meetings.map((meeting) => {
    const starts = new Date(meeting.starts_at).getTime();
    const ends = new Date(meeting.ends_at).getTime();

    if (ends <= at) return 'past';
    if (starts <= at && meeting.status !== 'cancelled') return 'now';
    return 'later';
  });

  if (states.includes('now')) return states;

  const upcoming = states.findIndex(
    (state, index) => state === 'later' && meetings[index].status !== 'cancelled'
  );
  if (upcoming !== -1) states[upcoming] = 'next';

  return states;
}

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

type TaskLike = {
  due_at: string | null;
  status: string;
};

export type DueDay<T> = {
  date: CalendarDate;
  tasks: T[];
};

export type DueSoon<T> = {
  /** Past their due time and still not finished. Shown first, and marked. */
  overdue: T[];
  /** Today onwards, one entry per day that has anything, earliest first. */
  days: DueDay<T>[];
};

/**
 * Split the deadlines into "late" and "the next few days", dropping anything
 * already finished or abandoned.
 *
 * Overdue is measured against the minute, not the day: an essay due at 09:00
 * is late at 09:01, and pretending otherwise until midnight is the kind of
 * politeness that loses marks.
 */
export function groupTasksByDay<T extends TaskLike>(
  tasks: readonly T[],
  options: { now: Date; today: CalendarDate; timeZone: string; days?: number }
): DueSoon<T> {
  const { now, today, timeZone } = options;
  const lastDay = shiftDate(today, (options.days ?? DUE_WINDOW_DAYS) - 1);

  const live = tasks
    .filter((task) => task.due_at !== null)
    .filter((task) => task.status !== 'done' && task.status !== 'dropped')
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));

  const overdue: T[] = [];
  const byDate = new Map<CalendarDate, T[]>();

  for (const task of live) {
    const due = new Date(String(task.due_at));

    if (due.getTime() < now.getTime()) {
      overdue.push(task);
      continue;
    }

    const date = localDateKey(due, timeZone);
    if (date < today || date > lastDay) continue;

    const day = byDate.get(date);
    if (day) day.push(task);
    else byDate.set(date, [task]);
  }

  const days = [...byDate.entries()]
    .map(([date, dayTasks]) => ({ date, tasks: dayTasks }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { overdue, days };
}

// ---------------------------------------------------------------------------
// Dates on screen
// ---------------------------------------------------------------------------

// A CalendarDate is already local, so it is formatted as if it were UTC —
// applying a timezone to it a second time is how dates slide by one day.
function formatWith(date: CalendarDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

/** 'Monday 24 August' — the date under the page title. */
export function formatDate(date: CalendarDate): string {
  return formatWith(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** 'Sat 22 Aug' — beside a task that is already late. */
export function formatShortDate(date: CalendarDate): string {
  return formatWith(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The heading above a day's deadlines. */
export function formatDayLabel(date: CalendarDate, today: CalendarDate): string {
  if (date === today) return 'Today';
  if (date === shiftDate(today, 1)) return 'Tomorrow';
  return formatDate(date);
}
