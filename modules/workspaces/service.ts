import type { SupabaseClient } from '@supabase/supabase-js';
import * as repo from './repo';
import type { Workspace } from './schema';

// Returns the user's workspace, creating it on first login.
export async function ensureWorkspace(
  db: SupabaseClient,
  ownerId: string
): Promise<Workspace> {
  const existing = await repo.findByOwner(db, ownerId);
  if (existing) return existing;
  return repo.insert(db, ownerId);
}
