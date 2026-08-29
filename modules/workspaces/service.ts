import type { SupabaseClient } from '@supabase/supabase-js';
import * as repo from './repo';
import { termInputSchema, type TermInput, type Workspace } from './schema';

// Returns the user's workspace, creating it on first login.
export async function ensureWorkspace(
  db: SupabaseClient,
  ownerId: string
): Promise<Workspace> {
  const existing = await repo.findByOwner(db, ownerId);
  if (existing) return existing;
  return repo.insert(db, ownerId);
}

/** One workspace by id, or null. */
export async function getWorkspace(
  db: SupabaseClient,
  id: string
): Promise<Workspace | null> {
  return repo.findById(db, id);
}

/**
 * When this term runs. Two plain calendar dates — the first and last day,
 * inclusive — and they are what "generate the rest of term" means.
 *
 * Both empty clears them, which is a term that has ended rather than an error.
 */
export async function setTerm(
  db: SupabaseClient,
  id: string,
  input: TermInput
): Promise<Workspace> {
  const parsed = termInputSchema.parse(input);
  return repo.updateTerm(db, id, {
    term_start: parsed.termStart ?? null,
    term_end: parsed.termEnd ?? null,
  });
}
