import { z } from 'zod';

// The engine's shapes.
//
// docs/SCHEMA.md calls `derivations` + `derivation_sources` "the engine", and
// the trigger over them "the product". Nothing in this file marks anything
// stale — that is `mark_derivations_stale()` in migration 001 and it stays in
// the database (prompts/11-recalc-engine.md, Constraints).

// ---------------------------------------------------------------------------
// Status
//
//   fresh     — up to date with every source version on its receipt
//   stale     — a source moved on. ONLY the database trigger writes this.
//   computing — a run is in flight. The worker guarantees it never stays here.
//   error     — the last run failed; `error` says why.
// ---------------------------------------------------------------------------

export const derivationStatusSchema = z.enum(['fresh', 'stale', 'computing', 'error']);
export type DerivationStatus = z.infer<typeof derivationStatusSchema>;

/** The recipes docs/SCHEMA.md names. `summarize` (11) and `answer` (12) are built. */
export const recipeSchema = z.enum(['summarize', 'flashcards', 'answer', 'extract', 'plan']);
export type RecipeName = z.infer<typeof recipeSchema>;

export const derivationSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  derived_block_id: z.uuid(),
  recipe: z.string(),
  model: z.string(),
  prompt_version: z.number().int(),
  status: derivationStatusSchema,
  error: z.string().nullable(),
  computed_at: z.string().nullable(),
});
export type Derivation = z.infer<typeof derivationSchema>;

export const derivationSourceSchema = z.object({
  derivation_id: z.uuid(),
  source_block_id: z.uuid(),
  source_version: z.number().int(),
  // Null for rows written before slice 11's migration — see 007_recalc.sql.
  source_text: z.string().nullable(),
});
export type DerivationSourceRow = z.infer<typeof derivationSourceSchema>;

// ---------------------------------------------------------------------------
// What a recipe reads, and what it gives back
// ---------------------------------------------------------------------------

/**
 * One block as a recipe actually read it.
 *
 * `version` is the number that goes on the receipt, and `text` is what the
 * block said at that moment. Both are read once, before the model is called,
 * so the receipt describes the input the model genuinely saw.
 */
export type ReadSource = {
  blockId: string;
  version: number;
  text: string;
};

/**
 * A recipe's output.
 *
 * `sources` is not a hint — it is the exact list the engine writes to
 * `derivation_sources`, built by the recipe out of the same array it built the
 * prompt from. An under-recorded source is a staleness bug that stays invisible
 * until someone edits that exact block and nothing goes stale, so the two
 * cannot be allowed to be assembled separately.
 */
export type RecipeOutput = {
  content: { text: string };
  sources: ReadSource[];
  /** Which model produced it, for `derivations.model`. */
  model: string;
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * What running a derivation did.
 *
 * A failure is a returned value rather than a throw, because every caller is a
 * screen: "the model could not be reached" belongs beside the summary, not in
 * an error boundary. The derivation is already marked `error` by the time this
 * comes back.
 */
export type RunResult =
  | { ok: true; derivationId: string; text: string; model: string }
  // `derivationId` is null when the failure happened before there was one to
  // fail — an empty note, say. Nothing was written in that case either.
  | { ok: false; derivationId: string | null; error: string };

/** A preview: generated, shown, and written nowhere. */
export type Preview = {
  derivationId: string;
  text: string;
  model: string;
  /** The versions the preview was generated against, for the accept guard. */
  sources: { blockId: string; version: number }[];
};

// ---------------------------------------------------------------------------
// /review
// ---------------------------------------------------------------------------

/** One source of a stale derivation, and what happened to it. */
export type ReviewSource = {
  blockId: string;
  /** The version on the receipt — what the summary was built from. */
  readVersion: number;
  /** What that block is at now. */
  currentVersion: number;
  changed: boolean;
  /** What it said when it was read. Null when no snapshot was taken. */
  before: string | null;
  /** What it says now. Null when the block has since been deleted. */
  after: string | null;
};

/** One row of the stale queue, with everything the screen needs to draw it. */
export type ReviewItem = {
  derivationId: string;
  recipe: string;
  model: string;
  status: DerivationStatus;
  error: string | null;
  computedAt: string | null;
  derivedBlockId: string;
  /** The summary — or the answer — as it stands right now. */
  currentText: string;
  /**
   * For `recipe: 'answer'`, the question it answers, so /review can label it as
   * an answer to that question rather than as a summary. Null for every other
   * recipe.
   */
  question: string | null;
  /** The note it was built from: null only if that note has been destroyed. */
  note: { blockId: string; title: string; href: string } | null;
  /** Every source, changed ones first. */
  sources: ReviewSource[];
};
