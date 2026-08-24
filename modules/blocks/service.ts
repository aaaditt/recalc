import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as repo from './repo';
import {
  createBlockInputSchema,
  updateBlockInputSchema,
  type Block,
  type BlockContent,
  type CreateBlockInput,
  type UpdateBlockInput,
} from './schema';

// ---------------------------------------------------------------------------
// Normalisation + hashing — the rule from docs/SCHEMA.md, verbatim.
// A typo fix that changes meaning bumps the version; whitespace does not.
// ---------------------------------------------------------------------------

export const normalise = (s: string) =>
  s.normalize('NFKC').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Plain text
//
// The text a block's meaning is judged by. Two shapes reach here:
//
//   { text: string }  — a plain block: a note document's title, a task, and
//                       everything written before slice 05.
//   a TipTap node     — one top-level node of a note document, stored verbatim
//                       as ProseMirror JSON.
//
// A TipTap node is walked rather than stringified, and only its text is taken.
// That is the whole reason bold, italic, code and a change of heading level do
// not bump a version: marks and attributes are not text. Stringifying the JSON
// instead would make applying bold look exactly like rewriting the sentence,
// and every derivation downstream would go stale for a formatting change.
// ---------------------------------------------------------------------------

type NodeLike = { type: string; text?: unknown; content?: unknown };

function isNodeLike(value: unknown): value is NodeLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function textOfNode(node: unknown): string {
  if (!isNodeLike(node)) return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';

  const children = Array.isArray(node.content) ? node.content : [];
  let text = '';

  for (const child of children) {
    const childType = isNodeLike(child) ? child.type : '';
    // Inline children run together, so bolding half a sentence leaves the
    // sentence unchanged. Block children get a break between them, so two list
    // items never merge into one word.
    text +=
      childType === 'text' || childType === 'hardBreak'
        ? textOfNode(child)
        : `\n${textOfNode(child)}`;
  }

  return text;
}

export function plainTextOf(content: BlockContent): string {
  if (typeof content.type === 'string') return textOfNode(content);
  if (typeof content.text === 'string') return content.text;
  // An unknown shape. Stable enough to hash, and loudly wrong if one ever
  // appears, which is what we want.
  return JSON.stringify(content);
}

export function hashContent(content: BlockContent): string {
  return createHash('sha256').update(normalise(plainTextOf(content))).digest('hex');
}

// ---------------------------------------------------------------------------
// Fractional positions — insert at the midpoint, never renumber siblings.
// ---------------------------------------------------------------------------

export function positionBetween(
  before: number | null,
  after: number | null
): number {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

// ---------------------------------------------------------------------------
// Writes. version and content_hash are owned here — nothing else may UPDATE
// blocks, or the staleness invariant silently breaks.
// ---------------------------------------------------------------------------

export async function createBlock(
  db: SupabaseClient,
  input: CreateBlockInput
): Promise<Block> {
  const parsed = createBlockInputSchema.parse(input);
  const parentId = parsed.parentId ?? null;
  const position =
    parsed.position ?? (await repo.maxPosition(db, parsed.workspaceId, parentId)) + 1;

  return repo.insert(db, {
    id: parsed.id,
    workspace_id: parsed.workspaceId,
    parent_id: parentId,
    position,
    type: parsed.type,
    content: parsed.content,
    content_hash: hashContent(parsed.content),
  });
}

export async function updateBlock(
  db: SupabaseClient,
  id: string,
  input: UpdateBlockInput
): Promise<Block> {
  const parsed = updateBlockInputSchema.parse(input);
  const current = await repo.getById(db, id);
  if (!current) throw new Error(`updateBlock: block ${id} not found`);

  const newHash = hashContent(parsed.content);
  const patch: Parameters<typeof repo.update>[2] = {
    content: parsed.content,
    updated_at: new Date().toISOString(),
    ...(parsed.type ? { type: parsed.type } : {}),
  };

  // The invariant: version bumps ONLY when the normalised content hash changed.
  // The version bump is what fires the staleness cascade in the database.
  if (newHash !== current.content_hash) {
    patch.version = current.version + 1;
    patch.content_hash = newHash;
  }

  return repo.update(db, id, patch);
}

/**
 * Move a block among its siblings. Position only — no version bump, no hash,
 * no cascade. Reordering the paragraphs of a note changes none of them, and
 * the test for that is modules/blocks/document.test.ts.
 */
export async function moveBlock(
  db: SupabaseClient,
  id: string,
  position: number
): Promise<Block> {
  return repo.updatePosition(db, id, position);
}

/**
 * Delete a node from a document. Soft, always: a derivation may name this
 * block, and destroying the row would destroy the provenance with it.
 */
export async function softDeleteBlock(db: SupabaseClient, id: string): Promise<Block> {
  return repo.markDeleted(db, id);
}

export async function getBlock(db: SupabaseClient, id: string): Promise<Block | null> {
  return repo.getById(db, id);
}

/** A block's live children in document order — a note document's nodes. */
export async function getChildBlocks(
  db: SupabaseClient,
  parentId: string
): Promise<Block[]> {
  return repo.listChildren(db, parentId);
}

/** Several blocks by id, in no particular order. */
export async function getBlocks(db: SupabaseClient, ids: string[]): Promise<Block[]> {
  return repo.listByIds(db, ids);
}
