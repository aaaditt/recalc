import { z } from 'zod';

// Search — the shapes.
//
// The one rule that shapes this whole module: a result may never be computed
// from an embedding whose version is behind its block's. That rule is enforced
// in SQL, by the `current_block_embeddings` view in migration 009, and nothing
// in TypeScript re-implements it. What lives here is the vocabulary.

/**
 * How many numbers a stored vector has.
 *
 * `block_embeddings.embedding` is `vector(1536)` — docs/SCHEMA.md picked the
 * number and the column enforces it. A provider whose embed model returns a
 * different width cannot be stored, and the indexer says so in a sentence
 * rather than letting Postgres reject 400 rows one at a time.
 */
export const EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One block waiting to be embedded: no vector at its current version. */
export const pendingBlockSchema = z.object({
  block_id: z.uuid(),
  version: z.number().int(),
  plain_text: z.string(),
});
export type PendingBlock = z.infer<typeof pendingBlockSchema>;

/** One row of `search_blocks`, before anything is resolved around it. */
export const searchRowSchema = z.object({
  block_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  block_type: z.string(),
  version: z.number().int(),
  plain_text: z.string(),
  /** The full-text half matched it. */
  lexical: z.boolean(),
  /** The vector half matched it — through the version-matched view, always. */
  semantic: z.boolean(),
  score: z.number(),
});
export type SearchRow = z.infer<typeof searchRowSchema>;

/** A stored vector, as the table holds it. Read only in tests and by cleanup. */
export const embeddingRowSchema = z.object({
  block_id: z.uuid(),
  version: z.number().int(),
  model: z.string(),
  created_at: z.string(),
});
export type EmbeddingRow = z.infer<typeof embeddingRowSchema>;

// ---------------------------------------------------------------------------
// What a screen gets back
// ---------------------------------------------------------------------------

/** One hit, with enough around it to be worth reading. */
export type SearchHit = {
  blockId: string;
  /** The block's own words — the passage that matched. */
  text: string;
  /** The version those words are at. Always the block's current one. */
  version: number;
  /** Which half or halves found it. Both is a strong hit. */
  matchedText: boolean;
  matchedMeaning: boolean;
  /** The note this passage lives in, and where to open it. */
  note: { blockId: string; title: string; href: string } | null;
  /** Which course that note is filed under, when it is filed under one. */
  courseId: string | null;
  /** A lecture note's date, as a local date key. Null for anything else. */
  date: string | null;
};

/** The hits for one course, in the order they should be drawn. */
export type SearchGroup = {
  /** Null for hits whose note is filed under no course. */
  courseId: string | null;
  hits: SearchHit[];
};

/** Everything the search screen renders, in one object. */
export type SearchResults = {
  query: string;
  groups: SearchGroup[];
  total: number;
  /**
   * Whether the vector half took part. False when the embed role is empty, the
   * key will not decrypt, or the provider refused — the search still ran, over
   * full text alone, and the screen says so in one line.
   */
  semantic: boolean;
  /** Why the vector half sat out, when it did. One sentence, or null. */
  semanticNote: string | null;
};

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/** What one pass of the indexer did. */
export type IndexResult = {
  /** Blocks embedded in this pass — only ones whose version had moved on. */
  embedded: number;
  /** Blocks still waiting after it. Non-zero means run it again. */
  remaining: number;
  /** Which model wrote the vectors, or null when nothing was written. */
  model: string | null;
  /** Null on success; one sentence when the embed role could not be reached. */
  error: string | null;
};
