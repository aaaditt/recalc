import type { SupabaseClient } from '@supabase/supabase-js';
import { dateRangeUtc, localTimeZone, type CalendarDate } from '@/lib/time';
import * as repo from './repo';
import {
  createTaskInputSchema,
  type CreateTaskInput,
  type Task,
  type TaskStatus,
} from './schema';

export async function createTask(
  db: SupabaseClient,
  input: CreateTaskInput
): Promise<Task> {
  const parsed = createTaskInputSchema.parse(input);
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

export async function setTaskStatus(
  db: SupabaseClient,
  id: string,
  status: TaskStatus
): Promise<Task> {
  return repo.updateStatus(db, id, status, new Date().toISOString());
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
