import type { SupabaseClient } from '@supabase/supabase-js';

import {
  questionAnchorSchema,
  questionSchema,
  type QuestionAnchorRow,
  type QuestionRow,
  type QuestionStatus,
} from './schema';

// The only file that touches `questions` and `question_anchors`.
//
// Every read of `questions` is scoped by workspace_id, so RLS is a backstop
// rather than the only guard — the service-role client used by tests and future
// jobs bypasses RLS entirely. `question_anchors` has no workspace_id of its own
// (ownership flows through the question block, as its policies do), so every
// read of it is keyed by ids the service has already proved.

// ---------------------------------------------------------------------------
// questions
// ---------------------------------------------------------------------------

/** Every question in the workspace, newest first. */
export async function listQuestions(
  db: SupabaseClient,
  workspaceId: string
): Promise<QuestionRow[]> {
  const { data, error } = await db
    .from('questions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`questions.listQuestions: ${error.message}`);
  return (data ?? []).map((row) => questionSchema.parse(row));
}

/** The lifecycle row for a question block, or null when it is not ours. */
export async function findByBlock(
  db: SupabaseClient,
  workspaceId: string,
  blockId: string
): Promise<QuestionRow | null> {
  const { data, error } = await db
    .from('questions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('block_id', blockId)
    .maybeSingle();
  if (error) throw new Error(`questions.findByBlock: ${error.message}`);
  return data ? questionSchema.parse(data) : null;
}

export async function insert(
  db: SupabaseClient,
  row: { workspace_id: string; block_id: string }
): Promise<QuestionRow> {
  const { data, error } = await db.from('questions').insert(row).select('*').single();
  if (error) throw new Error(`questions.insert: ${error.message}`);
  return questionSchema.parse(data);
}

export async function setStatus(
  db: SupabaseClient,
  id: string,
  status: QuestionStatus
): Promise<QuestionRow> {
  const { data, error } = await db
    .from('questions')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`questions.setStatus: ${error.message}`);
  return questionSchema.parse(data);
}

// ---------------------------------------------------------------------------
// question_anchors
// ---------------------------------------------------------------------------

export async function insertAnchors(
  db: SupabaseClient,
  questionBlockId: string,
  anchoredBlockIds: string[]
): Promise<void> {
  if (anchoredBlockIds.length === 0) {
    throw new Error('questions.insertAnchors: refusing to write a question anchored to nothing');
  }

  const { error } = await db.from('question_anchors').insert(
    anchoredBlockIds.map((anchoredBlockId) => ({
      question_block_id: questionBlockId,
      anchored_block_id: anchoredBlockId,
    }))
  );
  if (error) throw new Error(`questions.insertAnchors: ${error.message}`);
}

/** The anchors of several questions at once — one query for a whole list. */
export async function listAnchors(
  db: SupabaseClient,
  questionBlockIds: string[]
): Promise<QuestionAnchorRow[]> {
  if (questionBlockIds.length === 0) return [];
  const { data, error } = await db
    .from('question_anchors')
    .select('*')
    .in('question_block_id', questionBlockIds);
  if (error) throw new Error(`questions.listAnchors: ${error.message}`);
  return (data ?? []).map((row) => questionAnchorSchema.parse(row));
}
