import type { SupabaseClient } from '@supabase/supabase-js';

import { startOfWeek } from '@/lib/calendar';
import { FOCUS_MINUTES, MIN_LOGGABLE_MS } from '@/lib/pomodoro';
import {
  minutesByCourse,
  minutesByUnit,
  totalMinutes,
  type CourseMinutes,
  type StudySpan,
  type UnitStudy,
} from '@/lib/study';
import { dateRangeUtc, localTimeZone, todayIn, type CalendarDate } from '@/lib/time';
import { getCourse, getSyllabusUnits } from '@/modules/courses';

import * as repo from './repo';
import {
  focusRatingSchema,
  logStudySessionInputSchema,
  type FocusRating,
  type LogStudySessionInput,
  type StudySession,
} from './schema';

// ---------------------------------------------------------------------------
// Ownership of the ids a client supplies
//
// `workspaceId` is never forgeable: every caller derives it from the session.
// `courseId` and `unitId` are the opposite — they come from two <select>s in
// the browser, and the study_sessions RLS policy only validates `workspace_id`.
// It was never asked to prove that the course a row points at belongs to that
// workspace too.
//
// Three real bugs of exactly this shape were found in earlier slices
// (`createOneOffMeeting` in 04, `createStandaloneNote` in 05, and the four ids
// `modules/tasks` takes in 06 — all in docs/DECISIONS.md). This module follows
// slice 06's answer: one shared `checkLinks` that every write runs, so no call
// site can forget it, because no call site performs it.
// ---------------------------------------------------------------------------

async function checkLinks(
  db: SupabaseClient,
  workspaceId: string,
  links: { courseId: string; unitId?: string | null }
): Promise<void> {
  const course = await getCourse(db, workspaceId, links.courseId);
  if (!course) {
    throw new Error(`study: no course ${links.courseId} in this workspace`);
  }

  const unitId = links.unitId ?? null;
  if (unitId !== null) {
    // Safe to look up by course now: the course was just proved to be ours.
    const units = await getSyllabusUnits(db, links.courseId);
    if (!units.some((unit) => unit.id === unitId)) {
      throw new Error('study: that unit belongs to a different course');
    }
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Record a finished focus block.
 *
 * Idempotent on (workspace, started_at): asked twice for the same block — a
 * second tab, a double tap, a request the browser retried — it returns the row
 * it already wrote rather than logging the minutes again. A unique index backs
 * that up in the database.
 */
export async function logStudySession(
  db: SupabaseClient,
  input: LogStudySessionInput
): Promise<StudySession> {
  const parsed = logStudySessionInputSchema.parse(input);

  const startedAt = new Date(parsed.startedAt);
  const endedAt = new Date(parsed.endedAt);
  const ms = endedAt.getTime() - startedAt.getTime();

  if (ms < MIN_LOGGABLE_MS) {
    throw new Error('logStudySession: a session shorter than a minute is not a session');
  }
  // The instants arrive from the browser, so the length is checked rather than
  // trusted. One block is one pomodoro; anything longer is a wrong clock or a
  // forged payload, and either way it must not inflate the minutes.
  if (ms > FOCUS_MINUTES * 60_000) {
    throw new Error(`logStudySession: a session cannot be longer than ${FOCUS_MINUTES} minutes`);
  }

  await checkLinks(db, parsed.workspaceId, {
    courseId: parsed.courseId,
    unitId: parsed.unitId,
  });

  const iso = startedAt.toISOString();
  const already = await repo.findByStartedAt(db, parsed.workspaceId, iso);
  if (already) return already;

  return repo.insert(db, {
    workspace_id: parsed.workspaceId,
    course_id: parsed.courseId,
    unit_id: parsed.unitId ?? null,
    started_at: iso,
    ended_at: endedAt.toISOString(),
    focus_rating: parsed.focusRating ?? null,
  });
}

/** The one optional question, answered. Null puts it back to unanswered. */
export async function setFocusRating(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  rating: FocusRating | null
): Promise<StudySession> {
  const current = await repo.find(db, workspaceId, id);
  if (!current) throw new Error(`setFocusRating: no study session ${id} in this workspace`);

  return repo.updateRating(db, id, rating === null ? null : focusRatingSchema.parse(rating));
}

// ---------------------------------------------------------------------------
// Reads
//
// The aggregation is done in memory, over lib/study's pure functions. At one
// student's scale that is a few thousand rows a year and one query; the
// indexes are there to push it into SQL if that ever stops being true.
// ---------------------------------------------------------------------------

export async function getStudySession(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<StudySession | null> {
  return repo.find(db, workspaceId, id);
}

function spanOf(session: StudySession): StudySpan {
  return {
    courseId: session.course_id,
    unitId: session.unit_id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
  };
}

async function spansBetween(
  db: SupabaseClient,
  workspaceId: string,
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string
): Promise<StudySpan[]> {
  const range = dateRangeUtc(from, to, timeZone);
  const sessions = await repo.listBetween(db, workspaceId, range.startsAt, range.endsAt);
  return sessions.map(spanOf);
}

/** Total minutes studied on the local days `from`..`to` inclusive. */
export async function getMinutesBetween(
  db: SupabaseClient,
  workspaceId: string,
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string = localTimeZone()
): Promise<number> {
  return totalMinutes(await spansBetween(db, workspaceId, from, to, timeZone));
}

/** Minutes studied on one local day. This is /today's first number. */
export async function getMinutesOnDate(
  db: SupabaseClient,
  workspaceId: string,
  date: CalendarDate,
  timeZone: string = localTimeZone()
): Promise<number> {
  return getMinutesBetween(db, workspaceId, date, date, timeZone);
}

/** Minutes per course on the local days `from`..`to`, most studied first. */
export async function getMinutesPerCourseBetween(
  db: SupabaseClient,
  workspaceId: string,
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string = localTimeZone()
): Promise<CourseMinutes[]> {
  return minutesByCourse(await spansBetween(db, workspaceId, from, to, timeZone));
}

/**
 * Minutes per course this week, Monday to the day `today` falls on.
 *
 * The week starts on Monday because the calendar's does (lib/calendar's
 * WEEK_STARTS_ON), and two screens disagreeing about which week it is would be
 * worse than either answer.
 */
export async function getMinutesThisWeekPerCourse(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string = localTimeZone(),
  today: CalendarDate = todayIn(timeZone)
): Promise<CourseMinutes[]> {
  return getMinutesPerCourseBetween(db, workspaceId, startOfWeek(today), today, timeZone);
}

/** Total minutes this week. /today's second number. */
export async function getMinutesThisWeek(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string = localTimeZone(),
  today: CalendarDate = todayIn(timeZone)
): Promise<number> {
  return getMinutesBetween(db, workspaceId, startOfWeek(today), today, timeZone);
}

/**
 * Minutes and last-studied date per syllabus unit, across all time, most
 * studied first.
 *
 * This is the read slice 12 crosses with unanswered questions to say "6
 * questions on Unit 3 you never resolved... you've spent 20 minutes on it".
 */
export async function getUnitStudy(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string = localTimeZone()
): Promise<UnitStudy[]> {
  const sessions = await repo.listAll(db, workspaceId);
  return minutesByUnit(sessions.map(spanOf), timeZone);
}
