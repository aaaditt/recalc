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

// The text a block's meaning is judged by. Today content is { text: string };
// when richer shapes arrive (slice 05) this walks the document instead.
export function plainTextOf(content: BlockContent): string {
  if (typeof content.text === 'string') return content.text;
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
  };

  // The invariant: version bumps ONLY when the normalised content hash changed.
  // The version bump is what fires the staleness cascade in the database.
  if (newHash !== current.content_hash) {
    patch.version = current.version + 1;
    patch.content_hash = newHash;
  }

  return repo.update(db, id, patch);
}

export async function getBlock(db: SupabaseClient, id: string): Promise<Block | null> {
  return repo.getById(db, id);
}
