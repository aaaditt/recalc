import type { SupabaseClient } from '@supabase/supabase-js';

import { createBlock, getBlock, getBlocks, plainTextOf, softDeleteBlock } from '@/modules/blocks';
import { getNoteRefs } from '@/modules/notes';

import {
  derivationsDownstreamOf,
  derivationsForBlocks,
  inputsGoneMessage,
  readInputs,
  readNoteSources,
  resolveSources,
  subjectNoteOf,
} from './graph';
import { ANSWER, ANSWER_PROMPT_VERSION, hasNothingToAnswerFrom } from './recipes/answer';
import {
  EXTRACT,
  EXTRACT_PROMPT_VERSION,
  readStoredItems,
  type ExtractedItem,
} from './recipes/extract';
import {
  SUMMARIZE,
  SUMMARIZE_PROMPT_VERSION,
  hasNothingToSummarise,
} from './recipes/summarize';
import * as repo from './repo';
import type {
  Derivation,
  ReadSource,
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
// Answer a question
//
// The same engine, a second recipe. `runDerivation` is not reimplemented here
// and nothing below writes a status: this creates (or finds) the block and the
// derivation, seeds the receipt, and hands the id to the worker — exactly what
// `summariseNote` does above.
// ---------------------------------------------------------------------------

/**
 * "Answer this question."
 *
 * `questionBlockId` and `anchorBlockIds` both arrive from a browser, so both are
 * proved against this workspace before a block is written or a model is called.
 * modules/questions proves them too, on its own side of the boundary; this is
 * the check that holds for any caller, including a future job.
 */
export async function generateAnswer(
  db: SupabaseClient,
  ctx: EngineContext,
  input: { questionBlockId: string; anchorBlockIds: string[] },
  options: RunOptions = {}
): Promise<RunResult> {
  const question = await getBlock(db, input.questionBlockId);
  if (
    !question ||
    question.workspace_id !== ctx.workspaceId ||
    question.type !== 'question' ||
    question.deleted_at !== null
  ) {
    throw new Error(`generateAnswer: no question ${input.questionBlockId} in this workspace`);
  }

  const wanted = [...new Set(input.anchorBlockIds)];
  const anchors = (await getBlocks(db, wanted)).filter(
    (block) => block.workspace_id === ctx.workspaceId
  );
  if (anchors.length !== wanted.length) {
    throw new Error('generateAnswer: one of those blocks is not in this workspace');
  }

  const sources: ReadSource[] = [question, ...anchors].map((block) => ({
    blockId: block.id,
    version: block.version,
    text: plainTextOf(block.content),
  }));

  if (hasNothingToAnswerFrom({ question: plainTextOf(question.content), sources })) {
    return {
      ok: false,
      derivationId: null,
      error: 'The notes this question is about are empty, so there is nothing to answer from.',
    };
  }

  const existing = await findAnswerDerivation(db, ctx.workspaceId, question.id);
  const derivation =
    existing ?? (await createAnswerDerivation(db, ctx.workspaceId, sources));

  return runDerivation(db, ctx, derivation.id, options);
}

/** The answer derivation built from this question block, if there is one. */
async function findAnswerDerivation(
  db: SupabaseClient,
  workspaceId: string,
  questionBlockId: string
): Promise<Derivation | null> {
  const downstream = await derivationsDownstreamOf(db, workspaceId, questionBlockId);

  for (const derivation of downstream) {
    if (derivation.recipe !== ANSWER) continue;
    // An answer deleted from /review is a tombstone; asking again should not
    // resurrect it.
    const block = await getBlock(db, derivation.derived_block_id);
    if (block && block.deleted_at === null) return derivation;
  }

  return null;
}

/**
 * The answer block and its derivation, before anything has been generated.
 *
 * The receipt is seeded with the question block *and every anchored block*
 * straight away — not with the question alone. That is what lets
 * `readAnswerSources` find the whole input set on the very first run without
 * modules/recalc ever reading `question_anchors`, and it means an edit to an
 * anchored paragraph flags this answer even if it happens between the question
 * being asked and the answer being generated.
 */
async function createAnswerDerivation(
  db: SupabaseClient,
  workspaceId: string,
  sources: ReadSource[]
): Promise<Derivation> {
  const block = await createBlock(db, {
    workspaceId,
    type: 'answer',
    content: { text: '' },
  });

  const derivation = await repo.insert(db, {
    workspace_id: workspaceId,
    derived_block_id: block.id,
    recipe: ANSWER,
    model: NOT_YET_RUN,
    prompt_version: ANSWER_PROMPT_VERSION,
    status: 'computing',
  });

  await repo.replaceSources(db, derivation.id, sources);
  return derivation;
}

// ---------------------------------------------------------------------------
// Extract from an email
//
// The same engine, a third recipe. prompts/15-email-extraction.md, point 2:
// "Extraction is a derivation... It runs through the slice 11 worker like every
// other recipe. Do not write a separate pipeline for email." So this is the
// same nine lines `summariseNote` and `generateAnswer` are: find or create the
// block and the derivation, seed the receipt, hand the id to the worker.
//
// What it does NOT do is write a proposal, a task or anything else. It hands
// back what the model said, and modules/proposals — which owns
// `email_proposals` — decides what to do with it.
// ---------------------------------------------------------------------------

export type ExtractionRun =
  | { ok: true; derivationId: string; model: string; items: ExtractedItem[] }
  | { ok: false; derivationId: string | null; error: string };

/**
 * "Read this email and say what it proposes."
 *
 * `emailBlockId` arrives from a browser, so it is proved to be a live `email`
 * block in this workspace before a block is written or a model is called.
 *
 * The cheap gate is deliberately NOT here: by the time this runs, the decision
 * to spend a call has already been taken by `modules/proposals/gate.ts`, which
 * is where the sender and the subject can be weighed against the user's own
 * courses. This function always calls the model.
 */
export async function extractFromEmailBlock(
  db: SupabaseClient,
  ctx: EngineContext,
  emailBlockId: string,
  options: RunOptions = {}
): Promise<ExtractionRun> {
  const email = await getBlock(db, emailBlockId);
  if (
    !email ||
    email.workspace_id !== ctx.workspaceId ||
    email.type !== 'email' ||
    email.deleted_at !== null
  ) {
    throw new Error(`extractFromEmailBlock: no email block ${emailBlockId} in this workspace`);
  }

  const existing = await findExtractDerivation(db, ctx.workspaceId, email.id);
  const derivation =
    existing ??
    (await createExtractDerivation(db, ctx.workspaceId, {
      blockId: email.id,
      version: email.version,
      text: plainTextOf(email.content),
    }));

  const result = await runDerivation(db, ctx, derivation.id, options);
  if (!result.ok) return result;

  // The items are read back out of the block the engine just wrote, rather than
  // carried out of the recipe by a second route. One write, one read, no way
  // for the digest a person sees and the list a task is made from to disagree.
  const written = await getBlock(db, derivation.derived_block_id);
  return {
    ok: true,
    derivationId: derivation.id,
    model: result.model,
    items: written ? readStoredItems(written.content) : [],
  };
}

/** The extract derivation built from this email block, if there is one. */
async function findExtractDerivation(
  db: SupabaseClient,
  workspaceId: string,
  emailBlockId: string
): Promise<Derivation | null> {
  const downstream = await derivationsDownstreamOf(db, workspaceId, emailBlockId);

  for (const derivation of downstream) {
    if (derivation.recipe !== EXTRACT) continue;
    const block = await getBlock(db, derivation.derived_block_id);
    if (block && block.deleted_at === null) return derivation;
  }

  return null;
}

/** The extract block and its derivation, before anything has been generated. */
async function createExtractDerivation(
  db: SupabaseClient,
  workspaceId: string,
  source: ReadSource
): Promise<Derivation> {
  const block = await createBlock(db, {
    workspaceId,
    type: 'extract',
    content: { text: '', items: [] },
  });

  const derivation = await repo.insert(db, {
    workspace_id: workspaceId,
    derived_block_id: block.id,
    recipe: EXTRACT,
    model: NOT_YET_RUN,
    prompt_version: EXTRACT_PROMPT_VERSION,
    status: 'computing',
  });

  await repo.replaceSources(db, derivation.id, [source]);
  return derivation;
}

/**
 * Has this email already been read by the engine?
 *
 * The answer to "which of these do I still have to spend a call on". One query
 * for the whole mailbox rather than one per message.
 */
export async function emailBlocksAlreadyExtracted(
  db: SupabaseClient,
  workspaceId: string,
  emailBlockIds: string[]
): Promise<Set<string>> {
  const done = new Set<string>();
  if (emailBlockIds.length === 0) return done;

  const derivations = (await derivationsForBlocks(db, workspaceId, emailBlockIds)).filter(
    (derivation) => derivation.recipe === EXTRACT
  );
  if (derivations.length === 0) return done;

  const wanted = new Set(emailBlockIds);
  const receipts = await repo.listSourcesOfDerivations(db, derivations.map((d) => d.id));
  for (const row of receipts) {
    if (wanted.has(row.source_block_id)) done.add(row.source_block_id);
  }
  return done;
}

export type Answer = {
  derivationId: string;
  blockId: string;
  text: string;
  status: Derivation['status'];
  error: string | null;
  model: string;
  computedAt: string | null;
  /**
   * The blocks this answer actually read, from the receipt — never from
   * `question_anchors`. "Based on your notes from the 14 October lecture" has
   * to name what was read, not what was intended.
   */
  sourceBlockIds: string[];
};

/**
 * The answers to these questions, keyed by question block id.
 *
 * Batched, because every screen that shows questions shows a list of them.
 */
export async function getAnswers(
  db: SupabaseClient,
  workspaceId: string,
  questionBlockIds: string[]
): Promise<Map<string, Answer>> {
  const answers = new Map<string, Answer>();
  const wanted = [...new Set(questionBlockIds)];
  if (wanted.length === 0) return answers;

  // Receipt rows naming one of these question blocks: the downstream half of
  // the graph, asked for many blocks at once.
  const naming = await repo.listSourcesOfBlocks(db, wanted);
  const derivations = (
    await repo.listByIds(db, workspaceId, [...new Set(naming.map((row) => row.derivation_id))])
  ).filter((derivation) => derivation.recipe === ANSWER);
  if (derivations.length === 0) return answers;

  const blocks = await getBlocks(db, derivations.map((d) => d.derived_block_id));
  const blockById = new Map(blocks.map((block) => [block.id, block]));

  const receipts = await repo.listSourcesOfDerivations(db, derivations.map((d) => d.id));

  for (const derivation of derivations) {
    const block = blockById.get(derivation.derived_block_id);
    if (!block || block.deleted_at !== null) continue;

    const questionBlockId = naming.find(
      (row) => row.derivation_id === derivation.id
    )?.source_block_id;
    if (!questionBlockId) continue;

    answers.set(questionBlockId, {
      derivationId: derivation.id,
      blockId: block.id,
      text: plainTextOf(block.content),
      status: derivation.status,
      error: derivation.error,
      model: derivation.model,
      computedAt: derivation.computed_at,
      sourceBlockIds: receipts
        .filter((row) => row.derivation_id === derivation.id)
        .map((row) => row.source_block_id)
        .filter((id) => id !== questionBlockId),
    });
  }

  return answers;
}

/** One question's answer, or null if it has never been asked for. */
export async function getAnswer(
  db: SupabaseClient,
  workspaceId: string,
  questionBlockId: string
): Promise<Answer | null> {
  const answers = await getAnswers(db, workspaceId, [questionBlockId]);
  return answers.get(questionBlockId) ?? null;
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
  // The block each item's note link is resolved from. For a summary that is the
  // note document itself; for an answer it is one of the paragraphs the
  // question was anchored to, and modules/notes resolves either to the same
  // place. Collected here and looked up once, below.
  const noteCandidate = new Map<string, string>();

  for (const derivation of stale) {
    const derived = await getBlock(db, derivation.derived_block_id);
    if (!derived || derived.deleted_at !== null) continue;

    const resolved = await resolveSources(db, derivation.id);
    const note = await subjectNoteOf(db, workspaceId, derivation.id);

    // An answer's receipt names the question block. It is not a source that can
    // change — nothing in the app edits a question — so it is shown as the
    // item's subject rather than listed among "what changed in the note".
    const questionBlock = resolved.find(({ block }) => block?.type === 'question')?.block ?? null;

    const candidate =
      note?.id ??
      resolved.find(
        ({ block }) => block !== null && block.type !== 'question' && block.type !== 'note'
      )?.block?.id ??
      null;
    if (candidate) noteCandidate.set(derivation.id, candidate);

    const sources: ReviewSource[] = resolved
      .filter(
        ({ block }) =>
          block === null || (block.type !== 'note' && block.type !== 'question')
      )
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
      question: questionBlock ? plainTextOf(questionBlock.content) : null,
      note: null,
      sources,
    });
  }

  // A lecture note is read on its lecture page and a free-standing one at
  // /notes/<id>. modules/notes owns that resolution — there is no second place
  // in the app that decides where a note lives. It resolves a paragraph to the
  // document it sits in, so an answer's anchor and a summary's note document
  // are the same question asked twice.
  const refs = await getNoteRefs(db, workspaceId, [...noteCandidate.values()]);

  for (const item of items) {
    const candidate = noteCandidate.get(item.derivationId);
    const ref = candidate ? refs.get(candidate) : undefined;
    if (ref) item.note = { blockId: ref.docId, title: ref.title, href: ref.href };
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

  const inputs = await readInputs(db, ctx.workspaceId, derivation);
  if (!inputs) {
    return {
      ok: false,
      derivationId: derivation.id,
      error: inputsGoneMessage(derivation.recipe),
    };
  }

  const block = await getBlock(db, derivation.derived_block_id);

  await repo.replaceSources(db, derivation.id, inputs.sources);
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
