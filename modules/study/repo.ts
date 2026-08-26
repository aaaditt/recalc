import type { SupabaseClient } from '@supabase/supabase-js';

import { studySessionSchema, type StudySession } from './schema';

// The only file that touches the study_sessions table.
//
// Every read is scoped by workspace_id, so RLS is a backstop rather than the
// only guard — the same shape modules/tasks and modules/courses use.

export type NewStudySessionRow = {
  workspace_id: string;
  course_id: string;
  unit_id: string | null;
  started_at: string;
  ended_at: string;
  focus_rating: number | null;
};

export async function insert(
  db: SupabaseClient,
  row: NewStudySessionRow
): Promise<StudySession> {
  const { data, error } = await db
    .from('study_sessions')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`study.insert: ${error.message}`);
  return studySessionSchema.parse(data);
}

/** One session by id, or null when it is not this workspace's. */
export async function find(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<StudySession | null> {
  const { data, error } = await db
    .from('study_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`study.find: ${error.message}`);
  return data ? studySessionSchema.parse(data) : null;
}

/**
 * The session that already started at this instant, if there is one.
 *
 * A workspace can hold only one session per start instant (a unique index says
 * so), which is what makes logging the same finished block twice — a second
 * tab, a double tap, a retried request — impossible to turn into 50 minutes.
 */
export async function findByStartedAt(
  db: SupabaseClient,
  workspaceId: string,
  startedAt: string
): Promise<StudySession | null> {
  const { data, error } = await db
    .from('study_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('started_at', startedAt)
    .maybeSingle();
  if (error) throw new Error(`study.findByStartedAt: ${error.message}`);
  return data ? studySessionSchema.parse(data) : null;
}

export async function updateRating(
  db: SupabaseClient,
  id: string,
  rating: number | null
): Promise<StudySession> {
  const { data, error } = await db
    .from('study_sessions')
    .update({ focus_rating: rating })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`study.updateRating: ${error.message}`);
  return studySessionSchema.parse(data);
}

/** Every session in the workspace, oldest first. */
export async function listAll(
  db: SupabaseClient,
  workspaceId: string
): Promise<StudySession[]> {
  const { data, error } = await db
    .from('study_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('started_at', { ascending: true });
  if (error) throw new Error(`study.listAll: ${error.message}`);
  return (data ?? []).map((row) => studySessionSchema.parse(row));
}

/** Sessions that started inside the half-open instant range, oldest first. */
export async function listBetween(
  db: SupabaseClient,
  workspaceId: string,
  startsAt: string,
  endsAt: string
): Promise<StudySession[]> {
  const { data, error } = await db
    .from('study_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('started_at', startsAt)
    .lt('started_at', endsAt)
    .order('started_at', { ascending: true });
  if (error) throw new Error(`study.listBetween: ${error.message}`);
  return (data ?? []).map((row) => studySessionSchema.parse(row));
}
