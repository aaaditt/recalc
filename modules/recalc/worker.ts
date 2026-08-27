import type { SupabaseClient } from '@supabase/supabase-js';

import { generateWithRole, getAgentProfile, modelLabel, type Generate } from '@/modules/agents';
import { getBlocks, updateBlock } from '@/modules/blocks';

import { inputsGoneMessage, readInputs } from './graph';
import { ANSWER, answer } from './recipes/answer';
import { SUMMARIZE, summarize } from './recipes/summarize';
import * as repo from './repo';
import type { Derivation, Preview, ReadSource, RecipeOutput, RunResult } from './schema';

// The worker. One derivation, end to end.
//
//   mark computing -> read the sources -> call the model -> write the derived
//   block -> write the receipt -> mark fresh
//
// prompts/11-recalc-engine.md: "On failure, mark `error` with the message.
// Never leave a derivation stuck in `computing`." Everything below the line
// that writes `computing` is inside one try/catch whose catch resolves the
// status, so there is no code path — thrown, returned or awaited — that can
// walk away leaving that row mid-flight.
//
// Two orderings here are load-bearing and neither is an accident:
//
//   * the sources are read BEFORE the model is called, and the versions written
//     to the receipt are those. Write the versions as they are *after* a slow
//     call and an edit made during the call disappears without trace.
//   * the receipt is written BEFORE the status goes fresh, so there is never an
//     instant where a derivation is fresh with nothing on its receipt.

export type EngineContext = {
  workspaceId: string;
  userId: string;
};

export type RunOptions = {
  /**
   * The model call, substituted.
   *
   * The default is the `deep` role out of the user's own `agent_profiles` row
   * (CLAUDE.md, Never rule 6 — a role, never a model). The engine's tests pass
   * a stand-in built on the AI SDK's own mock model, so the whole of this file
   * runs for real against the real database with only the provider's network
   * faked. Without the seam the only testable outcome would be failure.
   */
  generate?: Generate;
};

function generatorFor(
  db: SupabaseClient,
  ctx: EngineContext,
  options: RunOptions
): Generate {
  return options.generate ?? generateWithRole(db, ctx.userId, 'deep');
}

// ---------------------------------------------------------------------------
// Producing — reads and a model call. Writes nothing at all.
// ---------------------------------------------------------------------------

async function produce(
  db: SupabaseClient,
  ctx: EngineContext,
  derivation: Derivation,
  generate: Generate
): Promise<RecipeOutput> {
  // One read for both recipes: the current state of exactly the blocks this
  // derivation is built from. graph.ts knows which blocks those are; this
  // function only knows which recipe reads them.
  const inputs = await readInputs(db, ctx.workspaceId, derivation);
  if (!inputs) {
    throw new Error(inputsGoneMessage(derivation.recipe));
  }

  switch (inputs.recipe) {
    case SUMMARIZE:
      return summarize({ title: inputs.title, sources: inputs.sources }, generate);
    case ANSWER:
      return answer({ question: inputs.question, sources: inputs.sources }, generate);
  }
}

// ---------------------------------------------------------------------------
// Persisting
// ---------------------------------------------------------------------------

/**
 * Write the result.
 *
 * The derived block goes through `updateBlock` — never a direct UPDATE
 * (CLAUDE.md, Never rule 5) — so its own version and hash stay correct and
 * anything derived *from this summary* goes stale in turn, through the same
 * trigger. The receipt is rewritten to exactly the sources the recipe read.
 *
 * The block is only ever updated, never created: a derivation names a block
 * that already exists, which is what makes regenerating twice produce one
 * block rather than two.
 */
async function persist(
  db: SupabaseClient,
  derivation: Derivation,
  output: RecipeOutput
): Promise<void> {
  await updateBlock(db, derivation.derived_block_id, { content: output.content });
  await repo.replaceSources(db, derivation.id, output.sources);
  await repo.setComputed(db, derivation.id, output.model);
}

/**
 * Close the window the `computing` status opens.
 *
 * `mark_derivations_stale()` only touches rows whose status is `fresh`. While a
 * run is in flight the row says `computing`, so an edit that lands mid-run is
 * invisible to the trigger — and the run would then write `fresh` against a
 * version that is already behind. That is a summary claiming to be current when
 * it is not, which is the one thing this product may never do.
 *
 * So after the status goes fresh, the versions are read once more and compared
 * to what was just recorded. This is not a second implementation of the cascade
 * — it decides nothing about which derivations an edit affects, it only asks
 * "did the blocks I just recorded move while I was working?" and fails towards
 * `stale`.
 */
async function settle(
  db: SupabaseClient,
  derivation: Derivation,
  recorded: ReadSource[]
): Promise<void> {
  const blocks = await getBlocks(db, recorded.map((source) => source.blockId));
  const version = new Map(blocks.map((block) => [block.id, block.version]));

  const moved = recorded.some(
    (source) => (version.get(source.blockId) ?? source.version) > source.version
  );

  if (moved) await repo.markStaleAfterRun(db, derivation.id);
}

/**
 * Record a failure on the derivation and hand back the sentence to show.
 *
 * `AgentNotConfigured` and `AgentKeyUnreadable` from modules/agents arrive here
 * like any other error and become a message on the row, which is exactly what
 * prompts/10-agents.md left those named classes for.
 */
async function fail(db: SupabaseClient, derivationId: string, error: unknown): Promise<string> {
  const message =
    error instanceof Error && error.message.trim() !== ''
      ? error.message.trim()
      : 'The model could not be reached.';

  try {
    await repo.setStatus(db, derivationId, 'error', message.slice(0, 500));
  } catch {
    // The only way this fails is the database being unreachable, in which case
    // there is nowhere left to write anything at all. Swallowed so the caller
    // still learns what actually went wrong rather than "fetch failed".
  }

  return message;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * Run one derivation to completion.
 *
 * Throws only when the id is not this workspace's — a forged id is a caller
 * bug, not a run that failed. Everything else comes back as
 * `{ ok: false, error }` with the row left at `error`, because every caller is
 * a screen.
 */
export async function runDerivation(
  db: SupabaseClient,
  ctx: EngineContext,
  derivationId: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const derivation = await repo.find(db, ctx.workspaceId, derivationId);
  if (!derivation) {
    throw new Error(`runDerivation: no derivation ${derivationId} in this workspace`);
  }

  await repo.setStatus(db, derivation.id, 'computing', null);

  // Everything from here resolves the status, on every path.
  try {
    const output = await produce(db, ctx, derivation, generatorFor(db, ctx, options));
    await persist(db, derivation, output);
    await settle(db, derivation, output.sources);

    return {
      ok: true,
      derivationId: derivation.id,
      text: output.content.text,
      model: output.model,
    };
  } catch (error) {
    return {
      ok: false,
      derivationId: derivation.id,
      error: await fail(db, derivation.id, error),
    };
  }
}

/**
 * Generate the new version and show it, writing nothing.
 *
 * /review puts this beside the current text so the before and after can be read
 * together, which is the whole point of the screen — "the valuable signal is
 * not the new summary, it is *your understanding of this topic just shifted*"
 * (docs/PRODUCT.md). A preview leaves the derivation exactly as it found it:
 * still stale, still with its old receipt, so closing the tab costs nothing.
 */
export async function previewDerivation(
  db: SupabaseClient,
  ctx: EngineContext,
  derivationId: string,
  options: RunOptions = {}
): Promise<{ ok: true; preview: Preview } | { ok: false; error: string }> {
  const derivation = await repo.find(db, ctx.workspaceId, derivationId);
  if (!derivation) {
    throw new Error(`previewDerivation: no derivation ${derivationId} in this workspace`);
  }

  try {
    const output = await produce(db, ctx, derivation, generatorFor(db, ctx, options));
    return {
      ok: true,
      preview: {
        derivationId: derivation.id,
        text: output.content.text,
        model: output.model,
        sources: output.sources.map((source) => ({
          blockId: source.blockId,
          version: source.version,
        })),
      },
    };
  } catch (error) {
    // Deliberately no status change: nothing was attempted on the row, so
    // nothing about it has changed. It is still stale and still waiting.
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The model could not be reached.',
    };
  }
}

/**
 * Accept a preview: write the text that was actually shown.
 *
 * The text comes back from the browser, because the point of the screen is that
 * the user accepted *that* version — regenerating on accept would write
 * something they never read. The versions come back too, and they are used for
 * one thing only: proving nothing moved in between. What lands on the receipt
 * is this function's own fresh read, never the numbers the browser sent. If a
 * paragraph changed since the preview, the accept is refused rather than
 * recording a version the summary was not built from.
 */
export async function acceptPreview(
  db: SupabaseClient,
  ctx: EngineContext,
  preview: { derivationId: string; text: string; sources: { blockId: string; version: number }[] }
): Promise<RunResult> {
  const derivation = await repo.find(db, ctx.workspaceId, preview.derivationId);
  if (!derivation) {
    throw new Error(`acceptPreview: no derivation ${preview.derivationId} in this workspace`);
  }

  const text = preview.text.trim();
  if (text === '') {
    return { ok: false, derivationId: derivation.id, error: 'There is nothing to accept.' };
  }

  const inputs = await readInputs(db, ctx.workspaceId, derivation);
  if (!inputs) {
    return {
      ok: false,
      derivationId: derivation.id,
      error: inputsGoneMessage(derivation.recipe),
    };
  }

  if (!sameSources(inputs.sources, preview.sources)) {
    return {
      ok: false,
      derivationId: derivation.id,
      error: 'This note changed again while you were reading. Regenerate to see it.',
    };
  }

  // The audit column is never taken from the browser: it is read back out of
  // the role that produced the preview a moment ago.
  const profile = await getAgentProfile(db, ctx.userId, 'deep');
  const model = profile ? modelLabel(profile.provider, profile.model) : derivation.model;

  try {
    await persist(db, derivation, { content: { text }, sources: inputs.sources, model });
    await settle(db, derivation, inputs.sources);
    return { ok: true, derivationId: derivation.id, text, model };
  } catch (error) {
    return {
      ok: false,
      derivationId: derivation.id,
      error: await fail(db, derivation.id, error),
    };
  }
}

/** Same blocks, same versions, order ignored. */
function sameSources(
  read: ReadSource[],
  claimed: { blockId: string; version: number }[]
): boolean {
  if (read.length !== claimed.length) return false;

  const versions = new Map(claimed.map((source) => [source.blockId, source.version]));
  return read.every((source) => versions.get(source.blockId) === source.version);
}
