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

export async function insert(
  db: SupabaseClient,
  row: {
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
