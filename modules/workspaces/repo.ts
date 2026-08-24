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
