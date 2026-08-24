import type { SupabaseClient } from '@supabase/supabase-js';

import { dateRangeUtc, localTimeZone, type CalendarDate } from '@/lib/time';
import { getBlock } from '@/modules/blocks';
import { getCourse, getMeeting, getSyllabusUnits } from '@/modules/courses';

import * as repo from './repo';
import {
  createTaskInputSchema,
  updateTaskInputSchema,
  type CreateTaskInput,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
} from './schema';

// ---------------------------------------------------------------------------
// Ownership of the ids a client supplies
//
// `workspaceId` is never forgeable: every caller derives it from the session.
// `courseId`, `unitId`, `meetingId` and `sourceBlockId` are the opposite — they
// arrive from a form, a sheet or a note in the browser, and the `tasks` RLS
// policy only ever validates `workspace_id`. It was never asked to prove that
// the course a row points at belongs to that workspace too.
//
// Two real bugs of exactly this shape were found and fixed in earlier slices
// (`createOneOffMeeting` in 04, `createStandaloneNote` in 05 — both in
// docs/DECISIONS.md). Every write below goes through `checkLinks` so this slice
// does not make it a third time.
// ---------------------------------------------------------------------------

type Links = {
  courseId?: string | null;
  unitId?: string | null;
  meetingId?: string | null;
  sourceBlockId?: string | null;
};

async function checkLinks(
  db: SupabaseClient,
  workspaceId: string,
  links: Links
): Promise<void> {
  const courseId = links.courseId ?? null;
  const unitId = links.unitId ?? null;
  const meetingId = links.meetingId ?? null;
  const sourceBlockId = links.sourceBlockId ?? null;

  if (courseId !== null) {
    const course = await getCourse(db, workspaceId, courseId);
    if (!course) {
      throw new Error(`tasks: no course ${courseId} in this workspace`);
    }
  }

  if (meetingId !== null) {
    const meeting = await getMeeting(db, workspaceId, meetingId);
    if (!meeting) {
      throw new Error(`tasks: no lecture ${meetingId} in this workspace`);
    }
    // A task filed under a lecture of a different course is a task that will
    // never be found again.
    if (courseId !== null && meeting.course_id !== courseId) {
      throw new Error('tasks: that lecture belongs to a different course');
    }
  }

  if (unitId !== null) {
    if (courseId === null) {
      throw new Error('tasks: a syllabus unit needs the course it belongs to');
    }
    // Safe to look up by course now: the course was just proved to be ours.
    const units = await getSyllabusUnits(db, courseId);
    if (!units.some((unit) => unit.id === unitId)) {
      throw new Error('tasks: that unit belongs to a different course');
    }
  }

  if (sourceBlockId !== null) {
    const block = await getBlock(db, sourceBlockId);
    if (!block || block.workspace_id !== workspaceId) {
      throw new Error(`tasks: no block ${sourceBlockId} in this workspace`);
    }
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createTask(
  db: SupabaseClient,
  input: CreateTaskInput
): Promise<Task> {
  const parsed = createTaskInputSchema.parse(input);

  await checkLinks(db, parsed.workspaceId, {
    courseId: parsed.courseId,
    unitId: parsed.unitId,
    meetingId: parsed.meetingId,
    sourceBlockId: parsed.sourceBlockId,
  });

  return repo.insert(db, {
    workspace_id: parsed.workspaceId,
    course_id: parsed.courseId ?? null,
    unit_id: parsed.unitId ?? null,
    meeting_id: parsed.meetingId ?? null,
    title: parsed.title,
    notes: parsed.notes ?? null,
    due_at: parsed.dueAt ?? null,
    status: parsed.status,
    effort_min: parsed.effortMin ?? null,
    source_block_id: parsed.sourceBlockId ?? null,
  });
}

/**
 * Edit a task. Absent fields are left alone, null clears them.
 *
 * `source_block_id` is not editable: where a task came from is a fact about
 * the past, and rewriting it would rewrite the provenance the /review queue
 * will later read.
 */
export async function updateTask(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  input: UpdateTaskInput
): Promise<Task> {
  const parsed = updateTaskInputSchema.parse(input);

  const current = await repo.find(db, workspaceId, id);
  if (!current) throw new Error(`updateTask: no task ${id} in this workspace`);

  const courseId = parsed.courseId === undefined ? current.course_id : parsed.courseId;
  const courseChanged = courseId !== current.course_id;

  // Moving a task to another course orphans a unit or a lecture that was not
  // renamed in the same edit — they belong to the course it just left. Clearing
  // them is the only answer that leaves the row consistent.
  const unitId =
    parsed.unitId !== undefined ? parsed.unitId : courseChanged ? null : current.unit_id;
  const meetingId =
    parsed.meetingId !== undefined
      ? parsed.meetingId
      : courseChanged
        ? null
        : current.meeting_id;

  await checkLinks(db, workspaceId, { courseId, unitId, meetingId });

  return repo.update(
    db,
    id,
    {
      course_id: courseId,
      unit_id: unitId,
      meeting_id: meetingId,
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
      ...(parsed.dueAt !== undefined ? { due_at: parsed.dueAt } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.effortMin !== undefined ? { effort_min: parsed.effortMin } : {}),
    },
    new Date().toISOString()
  );
}

/** One tap: done, or back to open. */
export async function setTaskStatus(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  status: TaskStatus
): Promise<Task> {
  const current = await repo.find(db, workspaceId, id);
  if (!current) throw new Error(`setTaskStatus: no task ${id} in this workspace`);
  return repo.updateStatus(db, id, status, new Date().toISOString());
}

export async function deleteTask(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<void> {
  const current = await repo.find(db, workspaceId, id);
  if (!current) throw new Error(`deleteTask: no task ${id} in this workspace`);
  await repo.remove(db, id);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every task in the workspace. /tasks filters this in one pure function. */
export async function getTasks(
  db: SupabaseClient,
  workspaceId: string
): Promise<Task[]> {
  return repo.listAll(db, workspaceId);
}

export async function getTask(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Task | null> {
  return repo.find(db, workspaceId, id);
}

/** Tasks due on the local days `from`..`to` inclusive, soonest first. */
export async function getTasksDueBetween(
  db: SupabaseClient,
  workspaceId: string,
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string = localTimeZone()
): Promise<Task[]> {
  const range = dateRangeUtc(from, to, timeZone);
  return repo.listDueBetween(db, workspaceId, range.startsAt, range.endsAt);
}

/**
 * Everything still open and already past due, oldest first. No lookback window:
 * a deadline from March is still a deadline.
 */
export async function getOverdueTasks(
  db: SupabaseClient,
  workspaceId: string,
  at: Date = new Date()
): Promise<Task[]> {
  return repo.listLiveDueBefore(db, workspaceId, at.toISOString());
}

/** The tasks set in one lecture. */
export async function getTasksForMeeting(
  db: SupabaseClient,
  workspaceId: string,
  meetingId: string
): Promise<Task[]> {
  return repo.listByMeeting(db, workspaceId, meetingId);
}

/** Tasks made from one block — a sentence in a note to the tasks it produced. */
export async function getTasksFromBlock(
  db: SupabaseClient,
  workspaceId: string,
  blockId: string
): Promise<Task[]> {
  return repo.listBySourceBlocks(db, workspaceId, [blockId]);
}

/** The same question asked about a whole note document's worth of blocks. */
export async function getTasksFromBlocks(
  db: SupabaseClient,
  workspaceId: string,
  blockIds: string[]
): Promise<Task[]> {
  return repo.listBySourceBlocks(db, workspaceId, blockIds);
}
