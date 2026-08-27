import type { SupabaseClient } from '@supabase/supabase-js';

import { createBlock, getBlock, plainTextOf, softDeleteBlock } from '@/modules/blocks';
import { getNoteRefs } from '@/modules/notes';

import { derivationsDownstreamOf, readNoteSources, resolveSources, subjectNoteOf } from './graph';
import {
  SUMMARIZE,
  SUMMARIZE_PROMPT_VERSION,
  hasNothingToSummarise,
} from './recipes/summarize';
import * as repo from './repo';
import type {
  Derivation,
  ReviewItem,
  ReviewSource,
  RunResult,
} from './schema';
import { getStaleDerivations } from './staleness';
import { runDerivation, type EngineContext, type RunOptions } from './worker';

// The engine's business logic: what a screen actually asks for.
//
// Every function here takes ids that came from a browser, so every one of them
// proves the thing it is handed belongs to the caller's workspace before it
// writes — the pattern slices 04 through 10 arrived at the hard way (see
// docs/DECISIONS.md). The check is inside the module rather than at the call
// sites, so no caller can forget it because no caller performs it.
//
// `workspaceId` and `userId` are never forgeable: every caller re-derives both
// from the session.

/**
 * The `model` a derivation carries between being created and being run for the
 * first time. The column is `not null` and app code may not choose a model
 * (docs/SCHEMA.md), so it says plainly that nothing has produced this yet; the
 * worker overwrites it with whatever actually did.
 */
const NOT_YET_RUN = 'pending';

// ---------------------------------------------------------------------------
// Summarise a note
// ---------------------------------------------------------------------------

/**
 * "Summarise this note."
 *
 * Creates the summary block and its derivation the first time, and reuses both
 * every time after — which is what makes running it twice produce one summary
 * rather than two (prompts/11-recalc-engine.md, Constraints). Nothing here runs
 * on its own: this is only ever reached from a button (docs/PRODUCT.md rule 2).
 */
export async function summariseNote(
  db: SupabaseClient,
  ctx: EngineContext,
  noteBlockId: string,
  options: RunOptions = {}
): Promise<RunResult> {
  // The ownership check. `readNoteSources` returns null for an id that is not a
  // live note document in this workspace, so a forged id stops here — before a
  // block is written and before a model is called.
  const read = await readNoteSources(db, ctx.workspaceId, noteBlockId);
  if (!read) {
    throw new Error(`summariseNote: no note ${noteBlockId} in this workspace`);
  }

  if (hasNothingToSummarise({ title: read.title, sources: read.sources })) {
    return {
      ok: false,
      derivationId: null,
      error: 'There is nothing written in this note yet to summarise.',
    };
  }

  const existing = await findSummaryDerivation(db, ctx.workspaceId, noteBlockId);
  const derivation = existing ?? (await createSummaryDerivation(db, ctx.workspaceId, read));

  return runDerivation(db, ctx, derivation.id, options);
}

/** The summarize derivation built from this note document, if there is one. */
async function findSummaryDerivation(
  db: SupabaseClient,
  workspaceId: string,
  noteBlockId: string
): Promise<Derivation | null> {
  const downstream = await derivationsDownstreamOf(db, workspaceId, noteBlockId);

  for (const derivation of downstream) {
    if (derivation.recipe !== SUMMARIZE) continue;
    // A derivation whose block was deleted from /review is a tombstone; a new
    // summary should not resurrect it.
    const block = await getBlock(db, derivation.derived_block_id);
    if (block && block.deleted_at === null) return derivation;
  }

  return null;
}

/**
 * The block and the row, before anything has been generated into them.
 *
 * The summary block is *not* a child of the note document. `saveNoteDocument`
 * reconciles a document against the nodes the editor sent and soft-deletes any
 * child it does not recognise — a summary parked in there would be destroyed by
 * the next keystroke. It hangs off nothing, and the receipt is what says which
 * note it belongs to.
 *
 * The receipt is seeded with the note document itself immediately, so the
 * derivation is linked to its note from the moment it exists rather than from
 * the moment a model first answers.
 */
async function createSummaryDerivation(
  db: SupabaseClient,
  workspaceId: string,
  read: NonNullable<Awaited<ReturnType<typeof readNoteSources>>>
): Promise<Derivation> {
  const block = await createBlock(db, {
    workspaceId,
    type: 'summary',
    content: { text: '' },
  });

  const derivation = await repo.insert(db, {
    workspace_id: workspaceId,
    derived_block_id: block.id,
    recipe: SUMMARIZE,
    model: NOT_YET_RUN,
    prompt_version: SUMMARIZE_PROMPT_VERSION,
    status: 'computing',
  });

  await repo.replaceSources(db, derivation.id, [read.sources[0]]);
  return derivation;
}

// ---------------------------------------------------------------------------
// Reading a note's summary
// ---------------------------------------------------------------------------

export type NoteSummary = {
  derivationId: string;
  blockId: string;
  text: string;
  status: Derivation['status'];
  error: string | null;
  model: string;
  computedAt: string | null;
};

/** The summary shown under a note, or null if it has never been asked for. */
export async function getNoteSummary(
  db: SupabaseClient,
  workspaceId: string,
  noteBlockId: string
): Promise<NoteSummary | null> {
  const derivation = await findSummaryDerivation(db, workspaceId, noteBlockId);
  if (!derivation) return null;

  const block = await getBlock(db, derivation.derived_block_id);
  if (!block) return null;

  return {
    derivationId: derivation.id,
    blockId: block.id,
    text: plainTextOf(block.content),
    status: derivation.status,
    error: derivation.error,
    model: derivation.model,
    computedAt: derivation.computed_at,
  };
}

// ---------------------------------------------------------------------------
// /review
// ---------------------------------------------------------------------------

/**
 * Everything waiting to be reviewed, with what changed under it.
 *
 * The comparison is the receipt against the blocks as they stand: the version
 * that was read, the version it is at now, and — because migration 007 keeps a
 * snapshot of what it said — the actual words on both sides.
 */
export async function getReviewQueue(
  db: SupabaseClient,
  workspaceId: string
): Promise<ReviewItem[]> {
  const stale = await getStaleDerivations(db, workspaceId);
  if (stale.length === 0) return [];

  const items: ReviewItem[] = [];

  for (const derivation of stale) {
    const derived = await getBlock(db, derivation.derived_block_id);
    if (!derived || derived.deleted_at !== null) continue;

    const resolved = await resolveSources(db, derivation.id);
    const note = await subjectNoteOf(db, workspaceId, derivation.id);

    const sources: ReviewSource[] = resolved
      .filter(({ block }) => block === null || block.type !== 'note')
      .map(({ row, block }) => ({
        blockId: row.source_block_id,
        readVersion: row.source_version,
        currentVersion: block?.version ?? row.source_version,
        changed: (block?.version ?? row.source_version) > row.source_version,
        before: row.source_text,
        after: block ? plainTextOf(block.content) : null,
      }))
      // Changed ones first: they are the reason this row is on the screen.
      .sort((a, b) => Number(b.changed) - Number(a.changed));

    items.push({
      derivationId: derivation.id,
      recipe: derivation.recipe,
      model: derivation.model,
      status: derivation.status,
      error: derivation.error,
      computedAt: derivation.computed_at,
      derivedBlockId: derived.id,
      currentText: plainTextOf(derived.content),
      note: note ? { blockId: note.id, title: '', href: `/notes/${note.id}` } : null,
      sources,
    });
  }

  // A lecture note is read on its lecture page and a free-standing one at
  // /notes/<id>. modules/notes owns that resolution — there is no second place
  // in the app that decides where a note lives.
  const refs = await getNoteRefs(
    db,
    workspaceId,
    items.flatMap((item) => (item.note ? [item.note.blockId] : []))
  );

  for (const item of items) {
    if (!item.note) continue;
    const ref = refs.get(item.note.blockId);
    if (ref) item.note = { blockId: item.note.blockId, title: ref.title, href: ref.href };
  }

  // Newest computation first: the thing you were most recently looking at is
  // the thing you most likely just changed.
  return items.sort((a, b) => (a.computedAt ?? '') < (b.computedAt ?? '') ? 1 : -1);
}

// ---------------------------------------------------------------------------
// The three answers /review offers
// ---------------------------------------------------------------------------

/**
 * "Keep old" — I have read the diff, and the summary still stands.
 *
 * The derived block is not touched. What changes is the receipt: it is rewritten
 * against the versions the sources are at *now*, and the row goes back to
 * `fresh`. See docs/DECISIONS.md for why that, rather than leaving it stale.
 */
export async function keepOldVersion(
  db: SupabaseClient,
  ctx: EngineContext,
  derivationId: string
): Promise<RunResult> {
  const derivation = await repo.find(db, ctx.workspaceId, derivationId);
  if (!derivation) {
    throw new Error(`keepOldVersion: no derivation ${derivationId} in this workspace`);
  }

  const note = await subjectNoteOf(db, ctx.workspaceId, derivation.id);
  const read = note ? await readNoteSources(db, ctx.workspaceId, note.id) : null;
  if (!read) {
    return {
      ok: false,
      derivationId: derivation.id,
      error: 'The note this was built from is gone.',
    };
  }

  const block = await getBlock(db, derivation.derived_block_id);

  await repo.replaceSources(db, derivation.id, read.sources);
  await repo.setComputed(db, derivation.id, derivation.model);

  return {
    ok: true,
    derivationId: derivation.id,
    text: block ? plainTextOf(block.content) : '',
    model: derivation.model,
  };
}

/**
 * "Delete" — this summary was not worth having.
 *
 * The block is soft-deleted, never destroyed: something else may cite it, and
 * docs/SCHEMA.md's rule is that provenance outlives the paragraph. The
 * derivation row itself goes, and takes its receipt with it by cascade, because
 * a receipt for a summary nobody is keeping is only something for /review to
 * trip over.
 */
export async function discardDerivation(
  db: SupabaseClient,
  ctx: EngineContext,
  derivationId: string
): Promise<void> {
  const derivation = await repo.find(db, ctx.workspaceId, derivationId);
  if (!derivation) {
    throw new Error(`discardDerivation: no derivation ${derivationId} in this workspace`);
  }

  await softDeleteBlock(db, derivation.derived_block_id);
  await repo.remove(db, derivation.id);
}
