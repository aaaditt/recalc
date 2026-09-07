import type { SupabaseClient } from '@supabase/supabase-js';

import * as repo from './repo';
import { SUMMARIZE } from './recipes/summarize';
import type { Derivation } from './schema';

// The stale queue — read only.
//
// prompts/11-recalc-engine.md: "read the stale queue; the marking itself is the
// DB trigger and must stay there."
//
// So there is deliberately nothing in this file that writes a status column, or
// anything else. If a future slice wants to mark something stale from
// TypeScript, the answer is still no: bump a source block's version through
// modules/blocks and let `mark_derivations_stale()` do it, exactly as an edit
// in the editor does. That is what makes the cascade impossible to bypass —
// including by us.

/**
 * Everything waiting in /review.
 *
 * Scoped to the workspace, which the `derivations (workspace_id, status)` index
 * from migration 001 is there for.
 */
export async function getStaleDerivations(
  db: SupabaseClient,
  workspaceId: string
): Promise<Derivation[]> {
  return repo.listByStatus(db, workspaceId, 'stale');
}

/**
 * The number in the nav.
 *
 * prompts/11-recalc-engine.md calls it "the number that makes me open the app",
 * so it is a `count` rather than a list that gets measured — every page in the
 * shell asks for it.
 */
export async function getStaleCount(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  return repo.countByStatus(db, workspaceId, 'stale');
}

/**
 * Runs that failed and were never retried.
 *
 * Not stale — nothing changed underneath them — but they are the other thing
 * /review has to be honest about: a summary that says "the model could not be
 * reached" is not a summary.
 */
export async function getFailedDerivations(
  db: SupabaseClient,
  workspaceId: string
): Promise<Derivation[]> {
  return repo.listByStatus(db, workspaceId, 'error');
}

// ---------------------------------------------------------------------------
// Two questions the guided setup path asks — slice 20
// ---------------------------------------------------------------------------
//
// Both are workspace-wide counts rather than lookups by note id, and that is
// deliberate. `/start`'s copy says "that note", meaning the one written a step
// earlier, but the predicate says *any*: a user who summarises a different note
// has done the thing the step teaches, and a predicate pinned to one block id
// would leave them stuck on a step they have already completed.

/** Has anything in this workspace ever been summarised? */
export async function countSummaries(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  return repo.countByRecipe(db, workspaceId, SUMMARIZE);
}

/**
 * Has a summary in this workspace ever gone stale?
 *
 * THE question of the whole product, asked as a number. It is not
 * `getStaleCount() > 0`: that goes back to zero the moment the diff is accepted
 * in /review — the correct action, and the one the guided path was teaching — so
 * a step keyed on it would un-tick itself at the exact moment the user
 * succeeded. `stale_runs` only ever increases. See migration 015.
 */
export async function countSummariesEverStale(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  return repo.countByRecipeEverStale(db, workspaceId, SUMMARIZE);
}
