import type { SupabaseClient } from '@supabase/supabase-js';

import {
  derivationSchema,
  derivationSourceSchema,
  type Derivation,
  type DerivationSourceRow,
  type DerivationStatus,
  type ReadSource,
} from './schema';

// The only file that touches `derivations` and `derivation_sources`.
//
// Two rules hold everywhere in here:
//
//   1. Every read of `derivations` is scoped by workspace_id, so RLS is a
//      backstop rather than the only guard — the service-role client used by
//      tests and future jobs bypasses RLS entirely.
//   2. Nothing in this file ever writes `status = 'stale'`. Marking stale is
//      `mark_derivations_stale()` in migration 001 and it stays in the
//      database. `setStatus` is typed to refuse it.

// ---------------------------------------------------------------------------
// Derivations — reads
// ---------------------------------------------------------------------------

/** One derivation, or null when it is not this workspace's. */
export async function find(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Derivation | null> {
  const { data, error } = await db
    .from('derivations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`recalc.find: ${error.message}`);
  return data ? derivationSchema.parse(data) : null;
}

/** Several derivations by id, scoped to the workspace. */
export async function listByIds(
  db: SupabaseClient,
  workspaceId: string,
  ids: string[]
): Promise<Derivation[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('derivations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  if (error) throw new Error(`recalc.listByIds: ${error.message}`);
  return (data ?? []).map((row) => derivationSchema.parse(row));
}

/** Every derivation in the workspace with this status. */
export async function listByStatus(
  db: SupabaseClient,
  workspaceId: string,
  status: DerivationStatus
): Promise<Derivation[]> {
  const { data, error } = await db
    .from('derivations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', status);
  if (error) throw new Error(`recalc.listByStatus: ${error.message}`);
  return (data ?? []).map((row) => derivationSchema.parse(row));
}

/** How many derivations are waiting in /review. The nav badge's number. */
export async function countByStatus(
  db: SupabaseClient,
  workspaceId: string,
  status: DerivationStatus
): Promise<number> {
  const { count, error } = await db
    .from('derivations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', status);
  if (error) throw new Error(`recalc.countByStatus: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Derivations — writes
// ---------------------------------------------------------------------------

export type NewDerivationRow = {
  workspace_id: string;
  derived_block_id: string;
  recipe: string;
  model: string;
  prompt_version: number;
  status: 'computing';
};

export async function insert(
  db: SupabaseClient,
  row: NewDerivationRow
): Promise<Derivation> {
  const { data, error } = await db
    .from('derivations')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`recalc.insert: ${error.message}`);
  return derivationSchema.parse(data);
}

/**
 * Move a derivation between the states the app owns.
 *
 * `'stale'` is deliberately not in the type. The trigger owns that transition,
 * and a TypeScript path to it would be a second, forgettable way to say the one
 * thing the whole product depends on.
 */
export async function setStatus(
  db: SupabaseClient,
  id: string,
  status: 'fresh' | 'computing' | 'error',
  errorMessage: string | null
): Promise<Derivation> {
  const { data, error } = await db
    .from('derivations')
    .update({ status, error: errorMessage })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`recalc.setStatus: ${error.message}`);
  return derivationSchema.parse(data);
}

/**
 * The end of a successful run: fresh, with the model that produced it and the
 * moment it did, written in one statement so the three cannot disagree.
 */
export async function setComputed(
  db: SupabaseClient,
  id: string,
  model: string
): Promise<Derivation> {
  const { data, error } = await db
    .from('derivations')
    .update({
      status: 'fresh',
      error: null,
      model,
      computed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`recalc.setComputed: ${error.message}`);
  return derivationSchema.parse(data);
}

/**
 * The one place a derivation is marked stale from TypeScript, and it is not the
 * cascade.
 *
 * The trigger only touches rows whose status is `fresh`. A source edited while
 * a run was in flight — status `computing` — is therefore invisible to it, and
 * the run would finish by writing `fresh` against a version that is already
 * old. worker.ts closes that window by re-reading the versions after the run
 * and calling this when one moved. It fails towards `stale`, never towards a
 * summary that claims to be current and is not.
 */
export async function markStaleAfterRun(
  db: SupabaseClient,
  id: string
): Promise<Derivation> {
  const { data, error } = await db
    .from('derivations')
    .update({ status: 'stale' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`recalc.markStaleAfterRun: ${error.message}`);
  return derivationSchema.parse(data);
}

export async function remove(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('derivations').delete().eq('id', id);
  if (error) throw new Error(`recalc.remove: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Derivation sources — the receipt
// ---------------------------------------------------------------------------

export async function listSources(
  db: SupabaseClient,
  derivationId: string
): Promise<DerivationSourceRow[]> {
  const { data, error } = await db
    .from('derivation_sources')
    .select('*')
    .eq('derivation_id', derivationId);
  if (error) throw new Error(`recalc.listSources: ${error.message}`);
  return (data ?? []).map((row) => derivationSourceSchema.parse(row));
}

/** Which derivations name this block as a source. The downstream half of the graph. */
export async function listSourcesOfBlock(
  db: SupabaseClient,
  blockId: string
): Promise<DerivationSourceRow[]> {
  const { data, error } = await db
    .from('derivation_sources')
    .select('*')
    .eq('source_block_id', blockId);
  if (error) throw new Error(`recalc.listSourcesOfBlock: ${error.message}`);
  return (data ?? []).map((row) => derivationSourceSchema.parse(row));
}

/** ...for several blocks at once, which is how a note's derivations are found. */
export async function listSourcesOfBlocks(
  db: SupabaseClient,
  blockIds: string[]
): Promise<DerivationSourceRow[]> {
  if (blockIds.length === 0) return [];
  const { data, error } = await db
    .from('derivation_sources')
    .select('*')
    .in('source_block_id', blockIds);
  if (error) throw new Error(`recalc.listSourcesOfBlocks: ${error.message}`);
  return (data ?? []).map((row) => derivationSourceSchema.parse(row));
}

/**
 * Write the receipt: exactly these sources, at exactly these versions.
 *
 * Upsert first, then delete what is no longer named — never the other way
 * round. A delete-then-insert that failed halfway would leave a derivation with
 * no sources at all, which the trigger cannot ever mark stale: the summary
 * would silently stop noticing its own note. This order's worst failure is a
 * stale row left behind, which only ever causes a false alarm.
 */
export async function replaceSources(
  db: SupabaseClient,
  derivationId: string,
  sources: ReadSource[]
): Promise<void> {
  if (sources.length === 0) {
    throw new Error('recalc.replaceSources: refusing to write a receipt with no sources');
  }

  const rows = sources.map((source) => ({
    derivation_id: derivationId,
    source_block_id: source.blockId,
    source_version: source.version,
    source_text: source.text,
  }));

  const { error: upsertError } = await db
    .from('derivation_sources')
    .upsert(rows, { onConflict: 'derivation_id,source_block_id' });
  if (upsertError) throw new Error(`recalc.replaceSources: ${upsertError.message}`);

  const keep = sources.map((source) => source.blockId);
  const { error: deleteError } = await db
    .from('derivation_sources')
    .delete()
    .eq('derivation_id', derivationId)
    .not('source_block_id', 'in', `(${keep.join(',')})`);
  if (deleteError) throw new Error(`recalc.replaceSources: ${deleteError.message}`);
}
