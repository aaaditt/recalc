import type { SupabaseClient } from '@supabase/supabase-js';

import {
  embeddingRowSchema,
  pendingBlockSchema,
  searchRowSchema,
  type EmbeddingRow,
  type PendingBlock,
  type SearchRow,
} from './schema';

// The only file that touches `block_embeddings`.
//
// Four of the five functions here are `rpc` calls rather than PostgREST
// queries, which is a first for this project and worth a sentence. Every one of
// them is a join or an anti-join between `block_embeddings` and `blocks`:
//
//   pending   — blocks with NO row at their current version
//   search    — full text over blocks, plus vectors, merged and ranked
//   cleanup   — delete rows whose version is behind their block's
//
// None of those can be written through the query builder at all, and each is a
// place where forgetting `version = version` would silently return a passage
// the user deleted five minutes ago. So the predicate lives in migration 009,
// once, in the `current_block_embeddings` view, and this file calls the
// functions that use it. There is deliberately no `select` on
// `block_embeddings` here that could bypass it — `listEmbeddingRows` below
// reads only the bookkeeping columns and never the vector.

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/**
 * Blocks with no embedding at their current version.
 *
 * This is "queue it for re-embedding when its version bumps", asked as a
 * question instead of stored as a fact: bumping a version leaves the block
 * without a row at its new version, which puts it here, with nothing written
 * and nothing that can be missed.
 */
export async function listPending(
  db: SupabaseClient,
  workspaceId: string,
  limit: number
): Promise<PendingBlock[]> {
  const { data, error } = await db.rpc('pending_embeddings', {
    p_workspace_id: workspaceId,
    p_limit: limit,
  });
  if (error) throw new Error(`search.listPending: ${error.message}`);
  return (data ?? []).map((row: unknown) => pendingBlockSchema.parse(row));
}

// ---------------------------------------------------------------------------
// Writing vectors
// ---------------------------------------------------------------------------

export type NewEmbedding = {
  block_id: string;
  version: number;
  /** pgvector's text form: `[0.1,0.2,...]`. PostgREST casts it on the way in. */
  embedding: string;
  model: string;
};

/**
 * Store vectors.
 *
 * Upsert on the composite key, so re-running the indexer over a block that was
 * embedded a moment ago is harmless. It never touches a row at a different
 * version: those are a separate key and are left exactly where they are, to be
 * removed by the cleanup job — or not, since nothing can read them.
 */
export async function upsertEmbeddings(
  db: SupabaseClient,
  rows: NewEmbedding[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from('block_embeddings')
    .upsert(rows, { onConflict: 'block_id,version' });
  if (error) throw new Error(`search.upsertEmbeddings: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

/**
 * Hybrid search: Postgres full text plus vector similarity, merged in SQL.
 *
 * `embedding` is null when there is no embed role configured — every provider
 * key in this app is the user's own and there may not be one. The function
 * degrades to full text alone rather than returning nothing.
 */
export async function search(
  db: SupabaseClient,
  workspaceId: string,
  query: string,
  embedding: string | null,
  limit: number
): Promise<SearchRow[]> {
  const { data, error } = await db.rpc('search_blocks', {
    p_workspace_id: workspaceId,
    p_query: query,
    p_embedding: embedding,
    p_limit: limit,
  });
  if (error) throw new Error(`search.search: ${error.message}`);
  return (data ?? []).map((row: unknown) => searchRowSchema.parse(row));
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** Delete every embedding row whose version is behind its block's. */
export async function deleteStale(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  const { data, error } = await db.rpc('delete_stale_embeddings', {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(`search.deleteStale: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

/**
 * Which versions of a block have a vector stored, newest first.
 *
 * Bookkeeping columns only — never the vector, so this cannot become a second
 * read path around the version predicate. It exists so the search screen can
 * say when a block was last indexed, and so the slice's test can prove that a
 * stale row is still physically in the table while being unreachable.
 */
export async function listEmbeddingRows(
  db: SupabaseClient,
  blockIds: string[]
): Promise<EmbeddingRow[]> {
  if (blockIds.length === 0) return [];
  const { data, error } = await db
    .from('block_embeddings')
    .select('block_id, version, model, created_at')
    .in('block_id', blockIds)
    .order('version', { ascending: false });
  if (error) throw new Error(`search.listEmbeddingRows: ${error.message}`);
  return (data ?? []).map((row) => embeddingRowSchema.parse(row));
}
