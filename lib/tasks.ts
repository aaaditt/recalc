// The arithmetic behind /tasks, kept out of the page so it can be tested
// without a database — the same shape lib/today.ts and lib/calendar.ts have.
//
// Nothing here imports a module. It works on the shape of a task, which is all
// three questions on the screen need:
//
//   which tasks does this filter show?  -> filterTasks
//   what order do they go in?           -> groupTasks
//   what does the due date say?         -> dueLabel

import { formatDayLabel, formatShortDate } from './today';
import { localDateKey, localTimeLabel, shiftDate, type CalendarDate } from './time';

type TaskLike = {
  due_at: string | null;
  status: string;
  course_id: string | null;
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * `open`    — anything still asking something of me. The default.
 * `overdue` — open and already late. The one that should be short.
 * `week`    — due in the next seven days, today included.
 * `done`    — finished or dropped, so a completed task can be found again.
 * `all`     — everything.
 */
export type TaskFilter = 'open' | 'overdue' | 'week' | 'done' | 'all';

export const TASK_FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'This week' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
];

/** How many days "this week" covers, counting today. */
export const WEEK_DAYS = 7;

/** '?f=' is a hint, not a promise: anything unrecognised means the default. */
export function filterFromParam(value: string | undefined): TaskFilter {
  return TASK_FILTERS.some((filter) => filter.value === value)
    ? (value as TaskFilter)
    : 'open';
}

/** '?c=' likewise — a course that is not mine simply does not filter anything. */
export function courseFromParam(
  value: string | undefined,
  courseIds: readonly string[]
): string | null {
  return typeof value === 'string' && courseIds.includes(value) ? value : null;
}

export function isLive(task: TaskLike): boolean {
  return task.status !== 'done' && task.status !== 'dropped';
}

export function isOverdue(task: TaskLike, now: Date): boolean {
  return (
    isLive(task) && task.due_at !== null && new Date(task.due_at).getTime() < now.getTime()
  );
}

export function filterTasks<T extends TaskLike>(
  tasks: readonly T[],
  options: {
    filter: TaskFilter;
    courseId: string | null;
    now: Date;
    today: CalendarDate;
    timeZone: string;
  }
): T[] {
  const { filter, courseId, now, today, timeZone } = options;
  const lastDay = shiftDate(today, WEEK_DAYS - 1);

  return tasks.filter((task) => {
    if (courseId !== null && task.course_id !== courseId) return false;

    switch (filter) {
      case 'all':
        return true;
      case 'done':
        return !isLive(task);
      case 'overdue':
        return isOverdue(task, now);
      case 'week': {
        if (!isLive(task) || task.due_at === null) return false;
        if (isOverdue(task, now)) return true;
        const date = localDateKey(new Date(task.due_at), timeZone);
        return date >= today && date <= lastDay;
      }
      case 'open':
      default:
        return isLive(task);
    }
  });
}

// ---------------------------------------------------------------------------
// Order on screen
// ---------------------------------------------------------------------------

export type TaskDay<T> = { date: CalendarDate; tasks: T[] };

export type TaskGroups<T> = {
  /** Late and still open. Always first, because it is the part that shouts. */
  overdue: T[];
  /** One entry per day that has anything, earliest first. No window on it. */
  days: TaskDay<T>[];
  /** Real tasks with no deadline yet. Last, and not a problem. */
  undated: T[];
  /** Done and dropped, kept out of the way of everything above. */
  finished: T[];
};

/**
 * Sort a list of tasks into the sections /tasks draws.
 *
 * The sibling of lib/today.ts's `groupTasksByDay`, and deliberately not the
 * same function: /today shows a seven-day window of live deadlines and nothing
 * else, while this screen is the place where an undated task and a finished one
 * both have to be findable.
 */
export function groupTasks<T extends TaskLike>(
  tasks: readonly T[],
  options: { now: Date; timeZone: string }
): TaskGroups<T> {
  const { now, timeZone } = options;

  const overdue: T[] = [];
  const undated: T[] = [];
  const finished: T[] = [];
  const byDate = new Map<CalendarDate, T[]>();

  const sorted = [...tasks].sort((a, b) => {
    if (a.due_at === null && b.due_at === null) return 0;
    if (a.due_at === null) return 1;
    if (b.due_at === null) return -1;
    return String(a.due_at).localeCompare(String(b.due_at));
  });

  for (const task of sorted) {
    if (!isLive(task)) {
      finished.push(task);
      continue;
    }
    if (task.due_at === null) {
      undated.push(task);
      continue;
    }
    if (isOverdue(task, now)) {
      overdue.push(task);
      continue;
    }

    const date = localDateKey(new Date(task.due_at), timeZone);
    const day = byDate.get(date);
    if (day) day.push(task);
    else byDate.set(date, [task]);
  }

  const days = [...byDate.entries()]
    .map(([date, dayTasks]) => ({ date, tasks: dayTasks }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { overdue, days, undated, finished };
}

// ---------------------------------------------------------------------------
// Dates on screen
// ---------------------------------------------------------------------------

/**
 * What goes at the right-hand end of a task row.
 *
 * Today and tomorrow get a time, because the time is what is left to decide.
 * Anything further away gets a date, because the hour stops mattering.
 */
export function dueLabel(
  dueAt: string | null,
  options: { today: CalendarDate; timeZone: string }
): string {
  if (dueAt === null) return '—';

  const { today, timeZone } = options;
  const date = localDateKey(new Date(dueAt), timeZone);

  if (date === today || date === shiftDate(today, 1)) {
    const prefix = date === today ? '' : `${formatDayLabel(date, today)} `;
    return `${prefix}${localTimeLabel(new Date(dueAt), timeZone)}`;
  }
  return formatShortDate(date);
}

/** The heading above a day's tasks. */
export function dayHeading(date: CalendarDate, today: CalendarDate): string {
  return formatDayLabel(date, today);
}
