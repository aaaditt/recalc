// Public API of the search module. Import only from here.
//
// Owns `block_embeddings` — one vector per (block, version) — and the four SQL
// functions migration 009 defines over it.
//
// The invariant, and the whole reason this module is versioned at all:
//
//   A search result is NEVER computed from an embedding whose version is
//   behind its block's current version.
//
// That is enforced in Postgres, once, by the `current_block_embeddings` view,
// and no TypeScript in here re-states it. An old row stays in the table and is
// simply unreachable — which is a stronger guarantee than deleting it on write,
// because it holds even if the cleanup job never runs.
// `modules/search/search-staleness.test.ts` proves both halves.
export {
  countPendingEmbeddings,
  getEmbeddingRows,
  indexWorkspace,
  purgeStaleEmbeddings,
  searchWorkspace,
  type IndexOptions,
  type SearchOptions,
} from './service';
export {
  EMBEDDING_DIMENSIONS,
  embeddingRowSchema,
  pendingBlockSchema,
  searchRowSchema,
  type EmbeddingRow,
  type IndexResult,
  type PendingBlock,
  type SearchGroup,
  type SearchHit,
  type SearchResults,
  type SearchRow,
} from './schema';
