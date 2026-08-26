// Adding up minutes. Pure functions over spans, no database.
//
// modules/study reads the rows and hands them here; the same arithmetic then
// serves /today's strip, the per-course week total and the per-unit totals
// slice 12 will cross with unanswered questions.

import { localDateKey, type CalendarDate } from '@/lib/time';

/** The shape every total is computed from. A `study_sessions` row, narrowed. */
export type StudySpan = {
  courseId: string;
  unitId: string | null;
  startedAt: string;
  endedAt: string;
};

/**
 * How many minutes one session was, rounded to the nearest minute.
 *
 * Read from the two instants rather than from anything the timer counted, so a
 * block that ran while the phone was locked is measured the same as one watched
 * the whole way through.
 */
export function sessionMinutes(span: StudySpan): number {
  const ms = new Date(span.endedAt).getTime() - new Date(span.startedAt).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

export function totalMinutes(spans: readonly StudySpan[]): number {
  return spans.reduce((sum, span) => sum + sessionMinutes(span), 0);
}

export type CourseMinutes = { courseId: string; minutes: number };

/** Minutes per course, most studied first. */
export function minutesByCourse(spans: readonly StudySpan[]): CourseMinutes[] {
  const totals = new Map<string, number>();
  for (const span of spans) {
    totals.set(span.courseId, (totals.get(span.courseId) ?? 0) + sessionMinutes(span));
  }
  return [...totals]
    .map(([courseId, minutes]) => ({ courseId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export type UnitStudy = {
  unitId: string;
  courseId: string;
  minutes: number;
  /** The instant of the most recent session on this unit. */
  lastStudiedAt: string;
  /** The local calendar day that instant falls on. */
  lastStudiedOn: CalendarDate;
};

/**
 * Minutes and last-studied date per syllabus unit, most studied first.
 *
 * Sessions with no unit are left out entirely: "20 minutes on Unit 3" is a
 * claim about a unit, and a session that never named one cannot support it.
 * The per-course totals above still count them.
 */
export function minutesByUnit(
  spans: readonly StudySpan[],
  timeZone: string
): UnitStudy[] {
  const totals = new Map<string, UnitStudy>();

  for (const span of spans) {
    if (span.unitId === null) continue;

    const found = totals.get(span.unitId);
    const minutes = (found?.minutes ?? 0) + sessionMinutes(span);
    const lastStudiedAt =
      found && found.lastStudiedAt > span.startedAt ? found.lastStudiedAt : span.startedAt;

    totals.set(span.unitId, {
      unitId: span.unitId,
      courseId: span.courseId,
      minutes,
      lastStudiedAt,
      lastStudiedOn: localDateKey(new Date(lastStudiedAt), timeZone),
    });
  }

  return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
}

/** '1h 25m', '45m', '0m'. The only place a duration becomes words. */
export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
