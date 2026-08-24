import type { SupabaseClient } from '@supabase/supabase-js';
import { LIVE_STATUSES, taskSchema, type Task, type TaskStatus } from './schema';

// The only file that touches the tasks table.
//
// Every read is scoped by workspace_id, so RLS is a backstop rather than the
// only guard — the same shape modules/courses uses.

export type NewTaskRow = {
  workspace_id: string;
  course_id: string | null;
  unit_id: string | null;
  meeting_id: string | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: TaskStatus;
  effort_min: number | null;
  source_block_id: string | null;
};

/** What an edit is allowed to change. `source_block_id` is not in it. */
export type TaskPatch = {
  course_id?: string | null;
  unit_id?: string | null;
  meeting_id?: string | null;
  title?: string;
  notes?: string | null;
  due_at?: string | null;
  status?: TaskStatus;
  effort_min?: number | null;
};

export async function insert(db: SupabaseClient, row: NewTaskRow): Promise<Task> {
  const { data, error } = await db.from('tasks').insert(row).select('*').single();
  if (error) throw new Error(`tasks.insert: ${error.message}`);
  return taskSchema.parse(data);
}

export async function updateStatus(
  db: SupabaseClient,
  id: string,
  status: TaskStatus,
  updatedAt: string
): Promise<Task> {
  const { data, error } = await db
    .from('tasks')
    .update({ status, updated_at: updatedAt })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`tasks.updateStatus: ${error.message}`);
  return taskSchema.parse(data);
}

export async function update(
  db: SupabaseClient,
  id: string,
  patch: TaskPatch,
  updatedAt: string
): Promise<Task> {
  const { data, error } = await db
    .from('tasks')
    .update({ ...patch, updated_at: updatedAt })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`tasks.update: ${error.message}`);
  return taskSchema.parse(data);
}

/**
 * Hard delete, unlike a block.
 *
 * A task carries no provenance of its own — nothing is derived *from* a task —
 * so there is nothing for a tombstone to protect. `dropped` is the status for
 * "decided not to do this"; delete is for "this was never a real task".
 */
export async function remove(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('tasks').delete().eq('id', id);
  if (error) throw new Error(`tasks.remove: ${error.message}`);
}

/** One task by id, or null when it is not this workspace's. */
export async function find(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Task | null> {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`tasks.find: ${error.message}`);
  return data ? taskSchema.parse(data) : null;
}

/** Every task in the workspace, soonest deadline first, undated last. */
export async function listAll(db: SupabaseClient, workspaceId: string): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`tasks.listAll: ${error.message}`);
  return (data ?? []).map((row) => taskSchema.parse(row));
}

/** Tasks due inside the half-open instant range [startsAt, endsAt), soonest first. */
export async function listDueBetween(
  db: SupabaseClient,
  workspaceId: string,
  startsAt: string,
  endsAt: string
): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('due_at', startsAt)
    .lt('due_at', endsAt)
    .order('due_at', { ascending: true });
  if (error) throw new Error(`tasks.listDueBetween: ${error.message}`);
  return (data ?? []).map((row) => taskSchema.parse(row));
}

/**
 * Everything still open and already past due, oldest first — with no window on
 * how far back it looks. This is the read /today's 30-day lookback stood in for
 * until this module could answer the question properly.
 */
export async function listLiveDueBefore(
  db: SupabaseClient,
  workspaceId: string,
  before: string
): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', [...LIVE_STATUSES])
    .not('due_at', 'is', null)
    .lt('due_at', before)
    .order('due_at', { ascending: true });
  if (error) throw new Error(`tasks.listLiveDueBefore: ${error.message}`);
  return (data ?? []).map((row) => taskSchema.parse(row));
}

/** Tasks set in one lecture, soonest deadline first. */
export async function listByMeeting(
  db: SupabaseClient,
  workspaceId: string,
  meetingId: string
): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('meeting_id', meetingId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`tasks.listByMeeting: ${error.message}`);
  return (data ?? []).map((row) => taskSchema.parse(row));
}

/** Tasks made from these blocks — the note-to-task direction of the link. */
export async function listBySourceBlocks(
  db: SupabaseClient,
  workspaceId: string,
  blockIds: string[]
): Promise<Task[]> {
  if (blockIds.length === 0) return [];
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('source_block_id', blockIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`tasks.listBySourceBlocks: ${error.message}`);
  return (data ?? []).map((row) => taskSchema.parse(row));
}
