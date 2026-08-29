import type { SupabaseClient } from '@supabase/supabase-js';

import { localTimeZone, todayIn } from '@/lib/time';
import {
  createCourse,
  createSession,
  generateMeetings,
  getCourses,
  getMeetingsForSession,
  getSession,
  getSessions,
  meetingWasHandEdited,
  removeMeetings,
  removeSession,
  updateSession,
  type ClassMeeting,
  type Course,
  type GenerateMeetingsResult,
  type Session,
} from '@/modules/courses';
import { getFilesForMeeting } from '@/modules/files';
import { getTasksForMeeting } from '@/modules/tasks';
import { getWorkspace, type Workspace } from '@/modules/workspaces';

import * as repo from './repo';
import {
  addClassInputSchema,
  DEFAULT_PERIODS,
  updateClassInputSchema,
  type AddClassInput,
  type Period,
  type RemoveClassResult,
  type UpdateClassInput,
} from './schema';

// The timetable: the printed period grid, and the three things you can do to a
// cell in it.
//
// This module owns `periods` and nothing else. Courses, weekly patterns and
// dated lectures all still belong to modules/courses, and every write below
// goes through that module's public API. What lives here is the *orchestration*
// — "adding a class means a course, then a session, then this term's lectures"
// — plus the one judgement no other module can make, which is whether a lecture
// is safe to delete. That question needs files and tasks as well as notes, and
// modules/files and modules/tasks both import modules/courses; asking it from
// here is what keeps that arrow pointing one way.

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/**
 * This workspace's periods, seeding the nine off last_sem.jpeg the first time.
 *
 * Idempotent, and safe to call on every render of /timetable: a workspace that
 * already has periods gets a single select. Migration 012 seeds every workspace
 * that existed when it ran; this covers every workspace made after it, which on
 * an empty database is all of them.
 */
export async function getPeriods(
  db: SupabaseClient,
  workspaceId: string
): Promise<Period[]> {
  const existing = await repo.listPeriods(db, workspaceId);
  if (existing.length > 0) return existing;

  return repo.insertPeriods(
    db,
    DEFAULT_PERIODS.map((period) => ({
      workspace_id: workspaceId,
      position: period.position,
      label: period.label,
      starts_at: period.startsAt,
      ends_at: period.endsAt,
    }))
  );
}

/** Everything /timetable draws, in one call. */
export async function getTimetable(
  db: SupabaseClient,
  workspaceId: string
): Promise<{
  periods: Period[];
  courses: Course[];
  sessions: Session[];
  workspace: Workspace | null;
}> {
  const [periods, courses, sessions, workspace] = await Promise.all([
    getPeriods(db, workspaceId),
    getCourses(db, workspaceId),
    getSessions(db, workspaceId),
    getWorkspace(db, workspaceId),
  ]);
  return { periods, courses, sessions, workspace };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Expand the weekly grid into this term's remaining lectures.
 *
 * "Remaining" is from today, or from the first day of term if term has not
 * started yet — adding a class in week six should not invent five weeks of
 * lectures that never happened.
 *
 * It is `generateMeetings` from slice 04 and nothing else. That function is
 * already additive and idempotent: it creates only the lectures that do not
 * exist, brings untouched ones back into line, and never modifies or duplicates
 * one that carries a note, a topic, a unit or a cancellation. There is exactly
 * one generator in this project and this is a call to it.
 *
 * Returns null when the term dates have not been set, which is a thing to tell
 * the user rather than an error: the weekly pattern is still saved.
 */
async function generateRestOfTerm(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string
): Promise<GenerateMeetingsResult | null> {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace?.term_start || !workspace.term_end) return null;

  const today = todayIn(timeZone);
  const from = today > workspace.term_start ? today : workspace.term_start;
  if (from > workspace.term_end) return { created: 0, updated: 0, unchanged: 0 };

  return generateMeetings(db, {
    workspaceId,
    termStart: from,
    termEnd: workspace.term_end,
    timeZone,
  });
}

// ---------------------------------------------------------------------------
// The three things you can do to a cell
// ---------------------------------------------------------------------------

export type ClassChange = {
  session: Session;
  /** Null when the term dates are not set yet, so nothing could be generated. */
  generated: GenerateMeetingsResult | null;
};

/**
 * Click an empty cell, fill in the little form, and the class exists.
 *
 * One period + one weekday is one `sessions` row; the period supplies the times
 * so they are never typed. A course can be picked from the list or created in
 * the same breath, because "MP&I meets 3rd period on a Wednesday" is one
 * thought and being sent somewhere else to make the course first breaks it.
 */
export async function addClass(
  db: SupabaseClient,
  input: AddClassInput
): Promise<ClassChange> {
  const parsed = addClassInputSchema.parse(input);
  const timeZone = parsed.timeZone ?? localTimeZone();

  const period = await repo.findPeriod(db, parsed.workspaceId, parsed.periodId);
  if (!period) throw new Error(`addClass: no period ${parsed.periodId} in this workspace`);

  let courseId = parsed.courseId;
  if (!courseId && parsed.newCourse) {
    // A term is required on `courses`. If one has not been typed, reuse the
    // term an existing course already uses, so a workspace does not quietly
    // split into two terms nobody chose.
    const existing = await getCourses(db, parsed.workspaceId);
    const term = parsed.newCourse.term ?? existing[0]?.term ?? 'This term';

    const course = await createCourse(db, {
      workspaceId: parsed.workspaceId,
      code: parsed.newCourse.code,
      name: parsed.newCourse.name,
      term,
      colour: parsed.newCourse.colour ?? null,
    });
    courseId = course.id;
  }
  if (!courseId) throw new Error('addClass: no course');

  const session = await createSession(db, {
    workspaceId: parsed.workspaceId,
    courseId,
    weekday: parsed.weekday,
    startsAt: period.starts_at,
    endsAt: period.ends_at,
    room: parsed.room ?? null,
    isLab: parsed.isLab ?? false,
    periodId: period.id,
  });

  return {
    session,
    generated: await generateRestOfTerm(db, parsed.workspaceId, timeZone),
  };
}

/**
 * Click a filled cell and change it: a different course, a different room, a
 * lab rather than a lecture, or the same class moved to another cell.
 *
 * The pattern is rewritten and then the term is regenerated — additively. A
 * lecture with a note on it keeps its old time and its old room, on purpose:
 * it is a record of a lecture that happened, and the timetable being corrected
 * afterwards does not change what happened.
 */
export async function updateClass(
  db: SupabaseClient,
  input: UpdateClassInput
): Promise<ClassChange> {
  const parsed = updateClassInputSchema.parse(input);
  const timeZone = parsed.timeZone ?? localTimeZone();

  let startsAt: string | undefined;
  let endsAt: string | undefined;
  if (parsed.periodId) {
    const period = await repo.findPeriod(db, parsed.workspaceId, parsed.periodId);
    if (!period) throw new Error(`updateClass: no period ${parsed.periodId} here`);
    startsAt = period.starts_at;
    endsAt = period.ends_at;
  }

  const session = await updateSession(db, parsed.workspaceId, parsed.sessionId, {
    courseId: parsed.courseId,
    weekday: parsed.weekday,
    periodId: parsed.periodId,
    startsAt,
    endsAt,
    room: parsed.room,
    isLab: parsed.isLab,
  });

  return {
    session,
    generated: await generateRestOfTerm(db, parsed.workspaceId, timeZone),
  };
}

/**
 * Is it safe to delete this lecture?
 *
 * Safe means: it carries nothing, and it has not happened yet. A lecture with a
 * note, a topic, a syllabus unit, a status other than `scheduled`, an attached
 * file or a task set in it is *work*, and work is never deleted by a timetable
 * edit. A lecture in the past is the record that it happened, so it stays too.
 *
 * The order is cheapest first: three fields on a row already in memory settle
 * most of it before either extra query is made.
 */
async function safeToDelete(
  db: SupabaseClient,
  workspaceId: string,
  meeting: ClassMeeting,
  nowMs: number
): Promise<boolean> {
  if (meetingWasHandEdited(meeting)) return false;
  if (new Date(meeting.starts_at).getTime() < nowMs) return false;

  const files = await getFilesForMeeting(db, workspaceId, meeting.id);
  if (files.length > 0) return false;

  const tasks = await getTasksForMeeting(db, workspaceId, meeting.id);
  if (tasks.length > 0) return false;

  return true;
}

/**
 * Remove a class from the grid.
 *
 * What this does NOT do is delete the lectures it produced. It deletes the
 * future, untouched ones — the ones that were only ever a consequence of the
 * pattern — and keeps every other one. A kept lecture loses its `session_id`
 * (the foreign key is `on delete set null`) and stays on the calendar with its
 * note, its files and its tasks intact.
 *
 * That is the safe direction to be wrong in. The worst case here is a lecture
 * left on the calendar that no longer happens, which is visible and one tap to
 * cancel. The worst case the other way is a term of notes with nothing to hang
 * off, and there is no undo for that.
 */
export async function removeClass(
  db: SupabaseClient,
  workspaceId: string,
  sessionId: string
): Promise<RemoveClassResult> {
  const session = await getSession(db, workspaceId, sessionId);
  if (!session) throw new Error(`removeClass: no session ${sessionId} in this workspace`);

  const meetings = await getMeetingsForSession(db, workspaceId, sessionId);
  const nowMs = Date.now();

  const deletable: string[] = [];
  for (const meeting of meetings) {
    if (await safeToDelete(db, workspaceId, meeting, nowMs)) deletable.push(meeting.id);
  }

  // The meetings go first. If this throws, the pattern is still there and the
  // grid still shows the class — which is a retry, not a mess.
  const removed = await removeMeetings(db, workspaceId, deletable);
  await removeSession(db, workspaceId, sessionId);

  return { removed, kept: meetings.length - removed };
}
