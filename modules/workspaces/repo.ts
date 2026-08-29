import type { SupabaseClient } from '@supabase/supabase-js';
import { workspaceSchema, type Workspace } from './schema';

// The only file that touches the workspaces table.

export async function findByOwner(
  db: SupabaseClient,
  ownerId: string
): Promise<Workspace | null> {
  const { data, error } = await db
    .from('workspaces')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`workspaces.findByOwner: ${error.message}`);
  return data ? workspaceSchema.parse(data) : null;
}

/** One workspace by id, or null. */
export async function findById(
  db: SupabaseClient,
  id: string
): Promise<Workspace | null> {
  const { data, error } = await db
    .from('workspaces')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`workspaces.findById: ${error.message}`);
  return data ? workspaceSchema.parse(data) : null;
}

/** When the current term runs. Both null clears it. */
export async function updateTerm(
  db: SupabaseClient,
  id: string,
  patch: { term_start: string | null; term_end: string | null }
): Promise<Workspace> {
  const { data, error } = await db
    .from('workspaces')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`workspaces.updateTerm: ${error.message}`);
  return workspaceSchema.parse(data);
}

export async function insert(
  db: SupabaseClient,
  ownerId: string
): Promise<Workspace> {
  const { data, error } = await db
    .from('workspaces')
    .insert({ owner_id: ownerId })
    .select('*')
    .single();
  if (error) throw new Error(`workspaces.insert: ${error.message}`);
  return workspaceSchema.parse(data);
}
