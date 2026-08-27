import {
  getBlock,
  getBlocks,
  getChildBlocks,
  plainTextOf,
  type Block,
} from '@/modules/blocks';
import type { SupabaseClient } from '@supabase/supabase-js';

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
    sources: [doc, ...children].map((block) => ({
      blockId: block.id,
      version: block.version,
      text: plainTextOf(block.content),
    })),
  };
}
