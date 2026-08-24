import type { SupabaseClient } from '@supabase/supabase-js';
import { blockSchema, type Block } from './schema';

// The only file that touches the blocks table. Nothing here decides *what* to
// write — version and hash rules live in service.ts.

export async function getById(db: SupabaseClient, id: string): Promise<Block | null> {
  const { data, error } = await db
    .from('blocks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`blocks.getById: ${error.message}`);
  return data ? blockSchema.parse(data) : null;
}

/** Every live child of a block, in document order. Soft-deleted rows are gone. */
export async function listChildren(
  db: SupabaseClient,
  parentId: string
): Promise<Block[]> {
  const { data, error } = await db
    .from('blocks')
    .select('*')
    .eq('parent_id', parentId)
    .is('deleted_at', null)
    .order('position', { ascending: true });
  if (error) throw new Error(`blocks.listChildren: ${error.message}`);
  return (data ?? []).map((row) => blockSchema.parse(row));
}

/** A handful of blocks by id — the note list's titles. Soft-deleted included. */
export async function listByIds(db: SupabaseClient, ids: string[]): Promise<Block[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from('blocks').select('*').in('id', ids);
  if (error) throw new Error(`blocks.listByIds: ${error.message}`);
  return (data ?? []).map((row) => blockSchema.parse(row));
}

export async function insert(
  db: SupabaseClient,
  row: {
    id?: string;
    workspace_id: string;
    parent_id: string | null;
    position: number;
    type: string;
    content: Record<string, unknown>;
    content_hash: string;
  }
): Promise<Block> {
  const { data, error } = await db.from('blocks').insert(row).select('*').single();
  if (error) throw new Error(`blocks.insert: ${error.message}`);
  return blockSchema.parse(data);
}

export async function update(
  db: SupabaseClient,
  id: string,
  patch: {
    content: Record<string, unknown>;
    updated_at: string;
    type?: string;
    version?: number;
    content_hash?: string;
  }
): Promise<Block> {
  const { data, error } = await db
    .from('blocks')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`blocks.update: ${error.message}`);
  return blockSchema.parse(data);
}

/**
 * Position only. Reordering a document is not an edit to any of its
 * paragraphs, so `version`, `content_hash` and `content` are untouched here —
 * and because the version does not move, the staleness trigger does not fire.
 */
export async function updatePosition(
  db: SupabaseClient,
  id: string,
  position: number
): Promise<Block> {
  const { data, error } = await db
    .from('blocks')
    .update({ position })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`blocks.updatePosition: ${error.message}`);
  return blockSchema.parse(data);
}

/** Soft delete: the row stays, because provenance outlives the paragraph. */
export async function markDeleted(db: SupabaseClient, id: string): Promise<Block> {
  const { data, error } = await db
    .from('blocks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`blocks.markDeleted: ${error.message}`);
  return blockSchema.parse(data);
}

// Highest position among siblings, or 0 when there are none.
export async function maxPosition(
  db: SupabaseClient,
  workspaceId: string,
  parentId: string | null
): Promise<number> {
  let query = db
    .from('blocks')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1);
  query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`blocks.maxPosition: ${error.message}`);
  return data ? Number(data.position) : 0;
}
