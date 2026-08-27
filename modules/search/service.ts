import type { SupabaseClient } from '@supabase/supabase-js';

import { localTimeZone } from '@/lib/time';
import {
  AgentKeyUnreadable,
  AgentNotConfigured,
  embedWithRole,
  type Embed,
} from '@/modules/agents';
import { getNoteRefs, listNotes } from '@/modules/notes';

import * as repo from './repo';
import {
  EMBEDDING_DIMENSIONS,
  type IndexResult,
  type SearchGroup,
  type SearchHit,
  type SearchResults,
} from './schema';

// Search.
//
// The claim this module makes is narrow and absolute: **a result is never
// computed from a stale embedding**. Not "usually not", not "we delete the old
// row on write so it should be fine" — never, because the only path to a vector
// is the `current_block_embeddings` view, whose definition is the version
// match. An embedding row whose version is behind its block's stays in the
// table and is simply unreachable. `search-staleness.test.ts` proves both
// halves of that sentence: the old row is still physically there, and it cannot
// be found.
//
// Everything else here is plumbing:
//
//   indexWorkspace      — embed the blocks whose version has moved on
//   searchWorkspace     — ask Postgres, then group the answers by course
//   purgeStaleEmbeddings— housekeeping; deletes what is already unreadable
//
// Nothing in this file re-implements the predicate, and nothing in it may. A
// second copy in TypeScript would be a second thing to forget.

/**
 * How many blocks one press of "Update the index" embeds.
 *
 * Small on purpose: every embedding is a call against the user's own API key,
 * a Server Action has a wall clock on it, and the screen reports what is left
 * so it can simply be pressed again. `remaining` is read from the same derived
 * queue, so it can never disagree with what was done.
 */
const INDEX_BATCH = 50;

/** How many hits come back from one search. One screen's worth, no more. */
const SEARCH_LIMIT = 30;

// ---------------------------------------------------------------------------
// Vectors, on the wire
// ---------------------------------------------------------------------------

/**
 * pgvector's text form.
 *
 * PostgREST sends JSON; the column is `vector(1536)`. `[0.1,0.2,...]` is what
 * pgvector's own input function reads, and it is what both the insert and the
 * search argument are given.
 */
function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `The embed role's model returned ${values.length} numbers per vector; ` +
        `Recalc stores ${EMBEDDING_DIMENSIONS}. Pick an embedding model of that width ` +
        'in Settings → Agents — OpenAI text-embedding-3-small is one.'
    );
  }
  return `[${values.join(',')}]`;
}

/** The sentence to show when the embed role could not produce a vector. */
function embedFailureMessage(error: unknown): string {
  if (error instanceof AgentNotConfigured) {
    return 'No embedding model is set up yet, so this is a plain word search. Add one in Settings → Agents.';
  }
  if (error instanceof AgentKeyUnreadable) {
    return 'The saved embedding key could not be read, so this is a plain word search.';
  }
  return error instanceof Error && error.message.trim() !== ''
    ? error.message.trim()
    : 'The embedding model could not be reached, so this is a plain word search.';
}

// ---------------------------------------------------------------------------
// Indexing — "queue it for re-embedding when its version bumps"
// ---------------------------------------------------------------------------

export type IndexOptions = {
  /**
   * The embedding call, substituted.
   *
   * The default is the `embed` role out of the user's own `agent_profiles` row
   * (CLAUDE.md, Never rule 6 — a role, never a model). The slice's test passes
   * a stand-in built on the AI SDK's own mock embedding model, so all of this
   * runs for real against the real database with only the provider's network
   * faked. It is the same seam slice 11 put on the worker, for the same reason.
   */
  embed?: Embed;
  /** How many blocks to embed in this pass. */
  batch?: number;
};

/** How many blocks are waiting for an embedding at their current version. */
export async function countPendingEmbeddings(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  // One more than a screenful is all the number needs to say; the queue is
  // derived, so counting it is the same query as reading it.
  return (await repo.listPending(db, workspaceId, INDEX_BATCH * 4)).length;
}

/**
 * Embed everything that is waiting, up to a batch.
 *
 * "Only changed blocks get re-embedded" is not a rule this function applies —
 * it is what `pending_embeddings` returns. A block whose version has not moved
 * already has a row at that version and never appears here, so an untouched
 * paragraph costs nothing on every run but the first.
 *
 * Failures come back as a sentence rather than a throw, because the caller is a
 * screen: with no provider key on the machine there is no embed role at all,
 * and "search still works, it is just words for now" is the right thing to say.
 */
export async function indexWorkspace(
  db: SupabaseClient,
  ctx: { workspaceId: string; userId: string },
  options: IndexOptions = {}
): Promise<IndexResult> {
  const batch = options.batch ?? INDEX_BATCH;
  const pending = await repo.listPending(db, ctx.workspaceId, batch);

  if (pending.length === 0) {
    return { embedded: 0, remaining: 0, model: null, error: null };
  }

  const embed = options.embed ?? embedWithRole(db, ctx.userId);

  let vectors: number[][];
  let model: string;
  try {
    const result = await embed(pending.map((block) => block.plain_text));
    vectors = result.vectors;
    model = result.model;
  } catch (error) {
    return {
      embedded: 0,
      remaining: pending.length,
      model: null,
      error: embedFailureMessage(error),
    };
  }

  if (vectors.length !== pending.length) {
    return {
      embedded: 0,
      remaining: pending.length,
      model: null,
      error: `The embedding model returned ${vectors.length} vectors for ${pending.length} blocks.`,
    };
  }

  try {
    await repo.upsertEmbeddings(
      db,
      pending.map((block, index) => ({
        block_id: block.block_id,
        // The version read alongside the text, never a fresh read: if the block
        // was edited while the provider was thinking, this row belongs to the
        // version that was actually embedded, and the new one is left pending.
        version: block.version,
        embedding: toVectorLiteral(vectors[index]),
        model,
      }))
    );
  } catch (error) {
    return {
      embedded: 0,
      remaining: pending.length,
      model: null,
      error: error instanceof Error ? error.message : 'Those vectors could not be stored.',
    };
  }

  return {
    embedded: pending.length,
    remaining: await countPendingEmbeddings(db, ctx.workspaceId),
    model,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

export type SearchOptions = {
  /** The embedding call, substituted. Same seam as the indexer's. */
  embed?: Embed;
  limit?: number;
  timeZone?: string;
};

/**
 * Find something.
 *
 * The query is embedded first, if there is an embed role to embed it with, and
 * both the words and the vector go into one SQL statement that merges full-text
 * and vector hits by reciprocal rank fusion. With no embed role the vector is
 * null and the same statement runs as a plain word search — which is the state
 * this machine is in and the reason search works here at all.
 *
 * Hits are then grouped by course, which is what makes the screen readable:
 * six results across three subjects read as three short lists, not one long
 * one. A hit whose block does not resolve to a note is dropped — a result that
 * cannot be opened is not a result.
 */
export async function searchWorkspace(
  db: SupabaseClient,
  ctx: { workspaceId: string; userId: string },
  query: string,
  options: SearchOptions = {}
): Promise<SearchResults> {
  const text = query.trim();
  const limit = options.limit ?? SEARCH_LIMIT;
  const zone = options.timeZone ?? localTimeZone();

  if (text === '') {
    return { query: '', groups: [], total: 0, semantic: false, semanticNote: null };
  }

  // --- the vector half's ingredient ---------------------------------------
  const embed = options.embed ?? embedWithRole(db, ctx.userId);
  let embedding: string | null = null;
  let semanticNote: string | null = null;

  try {
    const { vectors } = await embed([text]);
    embedding = vectors.length === 1 ? toVectorLiteral(vectors[0]) : null;
  } catch (error) {
    // Search does not fail because the model did. It narrows to words.
    semanticNote = embedFailureMessage(error);
  }

  // --- one statement, both halves, both version-current --------------------
  const rows = await repo.search(db, ctx.workspaceId, text, embedding, limit);
  if (rows.length === 0) {
    return {
      query: text,
      groups: [],
      total: 0,
      semantic: embedding !== null,
      semanticNote,
    };
  }

  // --- where each hit lives ------------------------------------------------
  // modules/notes owns both halves of this and nothing is resolved twice: the
  // ref says which document a block is in and how to open it, the note list
  // says which course that document is filed under.
  const refs = await getNoteRefs(db, ctx.workspaceId, rows.map((row) => row.block_id));
  const notes = new Map(
    (await listNotes(db, ctx.workspaceId, zone)).map((note) => [note.blockId, note])
  );

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const ref = refs.get(row.block_id);
    if (!ref) continue;
    const note = notes.get(ref.docId);

    hits.push({
      blockId: row.block_id,
      text: row.plain_text,
      version: row.version,
      matchedText: row.lexical,
      matchedMeaning: row.semantic,
      note: { blockId: ref.docId, title: ref.title, href: ref.href },
      courseId: note?.courseId ?? null,
      date: note?.date ?? null,
    });
  }

  // --- grouped by course, in the order the rows already rank ---------------
  const groups: SearchGroup[] = [];
  const byCourse = new Map<string | null, SearchHit[]>();

  for (const hit of hits) {
    const found = byCourse.get(hit.courseId);
    if (found) found.push(hit);
    else byCourse.set(hit.courseId, [hit]);
  }

  // Insertion order is best-hit-first, so the course holding the strongest
  // result is the first group on the screen. Anything filed under no course
  // goes last rather than first, whatever it scored.
  for (const [courseId, courseHits] of byCourse) {
    if (courseId !== null) groups.push({ courseId, hits: courseHits });
  }
  const orphans = byCourse.get(null);
  if (orphans) groups.push({ courseId: null, hits: orphans });

  return {
    query: text,
    groups,
    total: hits.length,
    semantic: embedding !== null,
    semanticNote,
  };
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Delete embedding rows whose version is behind their block's.
 *
 * prompts/13-search.md point 5. It is genuinely housekeeping and nothing more:
 * every row it removes was already unreachable through
 * `current_block_embeddings`, so running it changes no answer search can give.
 * That is on purpose — a cleanup job that has to run for the product to be
 * correct is a cleanup job that will one day not run.
 */
export async function purgeStaleEmbeddings(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  return repo.deleteStale(db, workspaceId);
}

/**
 * Which versions of these blocks have a vector stored.
 *
 * Bookkeeping only — the vectors themselves are not read here, so this cannot
 * become a second way to reach one. It exists for the slice's test and for the
 * search screen's one-line status.
 */
export async function getEmbeddingRows(db: SupabaseClient, blockIds: string[]) {
  return repo.listEmbeddingRows(db, blockIds);
}
