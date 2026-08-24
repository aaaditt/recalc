import type { SupabaseClient } from '@supabase/supabase-js';

import { standaloneNoteSchema, type StandaloneNote } from './schema';

// The only file that touches `standalone_notes`.
//
// Note *content* lives in `blocks` and is written through the blocks module —
// never from here. This table is an index of the note documents that have no
// lecture to hang off, and nothing else.

export async function listStandalone(
  db: SupabaseClient,
  workspaceId: string
): Promise<StandaloneNote[]> {
  const { data, error } = await db
    .from('standalone_notes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`notes.listStandalone: ${error.message}`);
  return (data ?? []).map((row) => standaloneNoteSchema.parse(row));
}

export async function findStandaloneByBlock(
  db: SupabaseClient,
  blockId: string
): Promise<StandaloneNote | null> {
  const { data, error } = await db
    .from('standalone_notes')
    .select('*')
    .eq('block_id', blockId)
    .maybeSingle();
  if (error) throw new Error(`notes.findStandaloneByBlock: ${error.message}`);
  return data ? standaloneNoteSchema.parse(data) : null;
}

export async function insertStandalone(
  db: SupabaseClient,
  row: {
    workspace_id: string;
    block_id: string;
    course_id: string | null;
    unit_id: string | null;
  }
): Promise<StandaloneNote> {
  const { data, error } = await db
    .from('standalone_notes')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`notes.insertStandalone: ${error.message}`);
  return standaloneNoteSchema.parse(data);
}
