import type { SupabaseClient } from '@supabase/supabase-js';

import * as repo from './repo';
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
