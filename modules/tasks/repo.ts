import type { SupabaseClient } from '@supabase/supabase-js';
import { taskSchema, type Task, type TaskStatus } from './schema';

// The only file that touches the tasks table.

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
