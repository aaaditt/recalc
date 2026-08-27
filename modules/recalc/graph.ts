import {
  getBlock,
  getBlocks,
  getChildBlocks,
  plainTextOf,
  type Block,
} from '@/modules/blocks';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ANSWER } from './recipes/answer';
import { EXTRACT, type EmailFacts } from './recipes/extract';
import { SUMMARIZE } from './recipes/summarize';
import * as repo from './repo';
import type { Derivation, DerivationSourceRow, ReadSource } from './schema';

// The graph, both ways round.
//
//   up   — a derivation's sources: what it was built from, and at what version
//   down — everything built from a given block
//
// Nothing here writes. It reads `derivation_sources` through the repo and joins
// it to `blocks` through modules/blocks, which is the only module allowed to
// touch that table.

// ---------------------------------------------------------------------------
// Upwards: a derivation's sources
// ---------------------------------------------------------------------------

/** A receipt line beside the block it names, as that block stands right now. */
export type ResolvedSource = {
  row: DerivationSourceRow;
  /** Null when the block has been destroyed outright (a workspace cascade). */
  block: Block | null;
};

/**
 * A derivation's sources, resolved.
 *
 * The receipt is the authority on *which* blocks and *which versions*; the
 * blocks are read fresh so a caller can compare the two. That comparison is
 * the whole of /review.
 */
export async function resolveSources(
  db: SupabaseClient,
  derivationId: string
): Promise<ResolvedSource[]> {
  const rows = await repo.listSources(db, derivationId);
  if (rows.length === 0) return [];

  const blocks = await getBlocks(db, rows.map((row) => row.source_block_id));
  const byId = new Map(blocks.map((block) => [block.id, block]));

  return rows.map((row) => ({ row, block: byId.get(row.source_block_id) ?? null }));
}

/**
 * The note document a derivation was built from.
 *
 * There is no `note_id` on `derivations` and there should not be: the receipt
 * already says what this was made from, and a second column could disagree with
 * it. Every derivation this engine writes names its note document among its
 * sources, so the link is simply the source that is a note.
 */
export async function subjectNoteOf(
  db: SupabaseClient,
  workspaceId: string,
  derivationId: string
): Promise<Block | null> {
  const resolved = await resolveSources(db, derivationId);

  for (const { block } of resolved) {
    if (block && block.type === 'note' && block.workspace_id === workspaceId) return block;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Downwards: what was built from a block
// ---------------------------------------------------------------------------

/**
 * Every derivation that read this block.
 *
 * This is the set the trigger walks when the block's version moves. Reading it
 * from TypeScript is for showing a person what is downstream of a paragraph —
 * never for marking anything.
 */
export async function derivationsDownstreamOf(
  db: SupabaseClient,
  workspaceId: string,
  blockId: string
): Promise<Derivation[]> {
  const rows = await repo.listSourcesOfBlock(db, blockId);
  return repo.listByIds(db, workspaceId, [...new Set(rows.map((row) => row.derivation_id))]);
}

/** ...for many blocks at once, without a query each. Slice 15 asks it of a mailbox. */
export async function derivationsForBlocks(
  db: SupabaseClient,
  workspaceId: string,
  blockIds: string[]
): Promise<Derivation[]> {
  if (blockIds.length === 0) return [];
  const rows = await repo.listSourcesOfBlocks(db, blockIds);
  return repo.listByIds(db, workspaceId, [...new Set(rows.map((row) => row.derivation_id))]);
}

/** ...for a whole note: its document block and every paragraph in it. */
export async function derivationsForNote(
  db: SupabaseClient,
  workspaceId: string,
  noteBlockId: string
): Promise<Derivation[]> {
  const children = await getChildBlocks(db, noteBlockId);
  const rows = await repo.listSourcesOfBlocks(db, [
    noteBlockId,
    ...children.map((child) => child.id),
  ]);
  return repo.listByIds(db, workspaceId, [...new Set(rows.map((row) => row.derivation_id))]);
}

// ---------------------------------------------------------------------------
// Reading a note as source material
// ---------------------------------------------------------------------------

/**
 * A note, read the way a recipe reads it: the document block first (it carries
 * the title), then every live paragraph in document order.
 *
 * Every one of these is recorded on the receipt, including the empty ones. An
 * empty paragraph contributes nothing to a prompt, but leaving it off the
 * receipt would mean typing a sentence into it later stales nothing — which is
 * the exact class of bug this whole module exists to prevent.
 *
 * Returns null when the id is not a live note document in this workspace. That
 * is the ownership check: every caller passes an id that came from a browser.
 */
export async function readNoteSources(
  db: SupabaseClient,
  workspaceId: string,
  noteBlockId: string
): Promise<{ title: string; sources: ReadSource[] } | null> {
  const doc = await getBlock(db, noteBlockId);
  if (!doc || doc.workspace_id !== workspaceId) return null;
  if (doc.type !== 'note' || doc.deleted_at !== null) return null;

  const children = await getChildBlocks(db, doc.id);
  const title = plainTextOf(doc.content);

  return {
    title,
    sources: [doc, ...children].map(asReadSource),
  };
}

/** A block as a recipe reads it: which block, at which version, saying what. */
function asReadSource(block: Block): ReadSource {
  return {
    blockId: block.id,
    version: block.version,
    text: plainTextOf(block.content),
  };
}

/**
 * An answer's sources, read the way its recipe reads them: the question block
 * first, then every block the question was anchored to, in document order.
 *
 * They come from the derivation's own receipt, not from `question_anchors`.
 * That is deliberate and it is the same decision as `subjectNoteOf` above: the
 * receipt already says what this answer was built from, so reading the anchor
 * set from a second table would create a second fact free to disagree with it —
 * and it keeps this module from having to know that `modules/questions` exists
 * at all. The receipt is seeded with the question and its anchors the moment
 * the derivation is created, so this is complete on the very first run.
 *
 * The blocks themselves are re-read here, so the versions and the words are
 * whatever they are *now* — which is what makes an answer regenerate against
 * the edited note rather than against the old one.
 *
 * Returns null when the receipt no longer names a live question block in this
 * workspace.
 */
export async function readAnswerSources(
  db: SupabaseClient,
  workspaceId: string,
  derivationId: string
): Promise<{ question: string; sources: ReadSource[] } | null> {
  const resolved = await resolveSources(db, derivationId);

  const blocks = resolved
    .map(({ block }) => block)
    .filter((block): block is Block => block !== null && block.workspace_id === workspaceId);

  const question = blocks.find((block) => block.type === 'question');
  if (!question || question.deleted_at !== null) return null;

  // A soft-deleted anchor is kept: the answer genuinely was built from it, and
  // dropping it from the receipt would quietly destroy that provenance. It is
  // the recipe that decides an empty block contributes nothing to the prompt.
  const anchors = blocks
    .filter((block) => block.id !== question.id)
    .sort((a, b) =>
      a.position !== b.position ? a.position - b.position : a.created_at < b.created_at ? -1 : 1
    );

  return {
    question: plainTextOf(question.content),
    sources: [question, ...anchors].map(asReadSource),
  };
}

// ---------------------------------------------------------------------------
// Reading an email as source material
// ---------------------------------------------------------------------------

/** A field of an `email` block's content, as slice 14's sync wrote it. */
function field(block: Block, name: string): string {
  const value = block.content[name];
  return typeof value === 'string' ? value : '';
}

/**
 * An extraction's source, read the way its recipe reads it: one `email` block,
 * and the sender, snippet and arrival time that slice 14 parked on it.
 *
 * Same decision as `readAnswerSources` — the block comes from the derivation's
 * own receipt, never from `email_messages`, so modules/recalc does not have to
 * know that modules/gmail exists. The receipt is seeded with the email block the
 * moment the derivation is created, so this is complete on the very first run.
 *
 * Returns null when the receipt no longer names a live email block in this
 * workspace.
 */
export async function readEmailSources(
  db: SupabaseClient,
  workspaceId: string,
  derivationId: string
): Promise<{ email: EmailFacts; sources: ReadSource[] } | null> {
  const resolved = await resolveSources(db, derivationId);

  const email = resolved
    .map(({ block }) => block)
    .find(
      (block): block is Block =>
        block !== null &&
        block.workspace_id === workspaceId &&
        block.type === 'email' &&
        block.deleted_at === null
    );
  if (!email) return null;

  return {
    email: {
      sender: field(email, 'sender'),
      // The block's own text is the subject — that is what slice 14 hashes.
      subject: plainTextOf(email.content),
      snippet: field(email, 'snippet'),
      receivedAt: field(email, 'received_at'),
    },
    sources: [asReadSource(email)],
  };
}

// ---------------------------------------------------------------------------
// One door for every recipe
// ---------------------------------------------------------------------------

/**
 * What a derivation's recipe needs to run, whichever recipe it is.
 *
 * The worker, the preview's accept guard and "keep old" all need the same
 * thing — the current state of exactly the blocks this derivation reads — and
 * only the worker cares which recipe it is. So the reading happens once, here.
 */
export type DerivationInputs =
  | { recipe: typeof SUMMARIZE; title: string; sources: ReadSource[] }
  | { recipe: typeof ANSWER; question: string; sources: ReadSource[] }
  | { recipe: typeof EXTRACT; email: EmailFacts; sources: ReadSource[] };

/** Null when the thing this was built from is gone, or the recipe is unknown. */
export async function readInputs(
  db: SupabaseClient,
  workspaceId: string,
  derivation: Derivation
): Promise<DerivationInputs | null> {
  if (derivation.recipe === SUMMARIZE) {
    const note = await subjectNoteOf(db, workspaceId, derivation.id);
    const read = note ? await readNoteSources(db, workspaceId, note.id) : null;
    return read ? { recipe: SUMMARIZE, title: read.title, sources: read.sources } : null;
  }

  if (derivation.recipe === ANSWER) {
    const read = await readAnswerSources(db, workspaceId, derivation.id);
    return read ? { recipe: ANSWER, question: read.question, sources: read.sources } : null;
  }

  if (derivation.recipe === EXTRACT) {
    const read = await readEmailSources(db, workspaceId, derivation.id);
    return read ? { recipe: EXTRACT, email: read.email, sources: read.sources } : null;
  }

  return null;
}

/** The sentence to show when `readInputs` comes back null. */
export function inputsGoneMessage(recipe: string): string {
  if (recipe === SUMMARIZE) return 'The note this was built from is gone.';
  if (recipe === ANSWER) return 'The question this answers is gone.';
  if (recipe === EXTRACT) return 'The email this was read from is gone.';
  return `There is no recipe called "${recipe}" yet.`;
}
