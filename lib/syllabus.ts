// The arithmetic behind the course page, kept out of the page so it can be
// tested without a database — the same shape lib/today.ts, lib/calendar.ts,
// lib/tasks.ts and lib/study.ts have.
//
// Nothing here imports a module. It works on the shape of a unit, a study
// total, a note and a task, which is all the screen asks:
//
//   what does one tap on a status chip do?   -> nextUnitStatus
//   what has this unit actually got on it?   -> rollUpUnits
//   how far through the course am I?         -> courseProgress
//
// docs/PRODUCT.md's payoff sentence needs the last two to be honest:
// "zero questions on Unit 1, three hours on it; six on Unit 3, twenty minutes."
// A progress number that flatters is worse than none at all.

import type { CalendarDate } from './time';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type UnitStatus = 'not_started' | 'shaky' | 'comfortable' | 'mastered';

/**
 * In order, weakest first. The order is the whole reason one tap can advance
 * the status: it means something to move along it.
 */
export const UNIT_STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'shaky', label: 'Shaky' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'mastered', label: 'Mastered' },
] as const satisfies readonly { value: UnitStatus; label: string }[];

const ORDER = UNIT_STATUSES.map((entry) => entry.value);

export function unitStatusLabel(status: UnitStatus): string {
  return UNIT_STATUSES.find((entry) => entry.value === status)?.label ?? 'Not started';
}

/**
 * One tap on the status chip. Advances along the list and wraps round from
 * `mastered` back to `not_started`, so every status is reachable from every
 * other without a menu — which is what "set by me in one tap" has to mean on a
 * phone held in one hand.
 */
export function nextUnitStatus(status: UnitStatus): UnitStatus {
  const at = ORDER.indexOf(status);
  return ORDER[(at + 1) % ORDER.length];
}

/**
 * Comfortable or better. This is the *only* thing progress counts, and it is
 * counted because I said so — never inferred from minutes or lectures attended
 * (prompts/08-syllabus.md: "No AI in this slice. Status is manual.").
 */
export function isCovered(status: UnitStatus): boolean {
  return status === 'comfortable' || status === 'mastered';
}

// ---------------------------------------------------------------------------
// One unit, with everything hanging off it
// ---------------------------------------------------------------------------

/** A `syllabus_units` row, narrowed to what the screen reads. */
export type UnitFacts = {
  id: string;
  title: string;
  position: number;
  status: UnitStatus;
};

/** What the module reads hand over, keyed by unit. */
export type UnitActivity = {
  /** From modules/study's getUnitStudy. */
  study: readonly { unitId: string; minutes: number; lastStudiedOn: CalendarDate }[];
  /** Every note in the workspace; the ones naming this unit are counted. */
  notes: readonly { unitId: string | null }[];
  /** Every task in the workspace, with its status, for the same reason. */
  tasks: readonly { unitId: string | null; status: string }[];
};

export type UnitRollup = UnitFacts & {
  minutes: number;
  /** The local day this unit was last studied on, or null if never. */
  lastStudiedOn: CalendarDate | null;
  notes: number;
  tasks: number;
  /** Tasks still asking something of me: `open` or `doing`. */
  openTasks: number;
  /**
   * Nothing has ever happened here: no minutes, no notes, no tasks, and the
   * status still untouched. This is the "which units have I never opened"
   * that prompts/08-syllabus.md's definition of done asks to see at a glance.
   */
  untouched: boolean;
};

const LIVE = new Set(['open', 'doing']);

/**
 * Units in syllabus order, each carrying its minutes, notes and tasks.
 *
 * Done in memory over one read of each list, the same trade modules/study
 * makes: at one student's scale this is a few hundred rows, and the arithmetic
 * that can be silently wrong is the part that then has a test around it.
 */
export function rollUpUnits(
  units: readonly UnitFacts[],
  activity: UnitActivity
): UnitRollup[] {
  const study = new Map(activity.study.map((entry) => [entry.unitId, entry]));

  const notes = new Map<string, number>();
  for (const note of activity.notes) {
    if (note.unitId === null) continue;
    notes.set(note.unitId, (notes.get(note.unitId) ?? 0) + 1);
  }

  const tasks = new Map<string, { all: number; open: number }>();
  for (const task of activity.tasks) {
    if (task.unitId === null) continue;
    const found = tasks.get(task.unitId) ?? { all: 0, open: 0 };
    found.all += 1;
    if (LIVE.has(task.status)) found.open += 1;
    tasks.set(task.unitId, found);
  }

  return [...units]
    .sort((a, b) => a.position - b.position)
    .map((unit) => {
      const studied = study.get(unit.id);
      const taskCounts = tasks.get(unit.id) ?? { all: 0, open: 0 };
      const noteCount = notes.get(unit.id) ?? 0;
      const minutes = studied?.minutes ?? 0;

      return {
        ...unit,
        minutes,
        lastStudiedOn: studied?.lastStudiedOn ?? null,
        notes: noteCount,
        tasks: taskCounts.all,
        openTasks: taskCounts.open,
        untouched:
          unit.status === 'not_started' &&
          minutes === 0 &&
          noteCount === 0 &&
          taskCounts.all === 0,
      };
    });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type CourseProgress = {
  total: number;
  /** Marked comfortable or mastered. */
  covered: number;
  /** Never opened at all. */
  untouched: number;
  minutes: number;
};

export function courseProgress(units: readonly UnitRollup[]): CourseProgress {
  return {
    total: units.length,
    covered: units.filter((unit) => isCovered(unit.status)).length,
    untouched: units.filter((unit) => unit.untouched).length,
    minutes: units.reduce((sum, unit) => sum + unit.minutes, 0),
  };
}

/**
 * Progress in words, and deliberately not as a percentage.
 *
 * prompts/08-syllabus.md: "honest about what it measures — units marked
 * comfortable or better, not a fake percentage". "43%" reads like a
 * measurement of how much of the course I know; "6 of 14 comfortable or
 * better" reads like what it is, which is a count of boxes I ticked myself.
 */
export function progressLabel(progress: CourseProgress): string {
  if (progress.total === 0) return 'No units yet';

  const covered = `${progress.covered} of ${progress.total} comfortable or better`;
  if (progress.untouched === 0) return covered;
  return `${covered} · ${progress.untouched} never opened`;
}
