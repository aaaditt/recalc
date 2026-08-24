import { z } from 'zod';

export const blockTypeSchema = z.enum([
  'text',
  'heading',
  'todo',
  'course',
  'unit',
  'email',
  'summary',
  'question',
  'answer',
  'flashcard',
  // A note document: the parent block whose children are its paragraphs. Added
  // in slice 05; docs/SCHEMA.md lists the types in a comment and this is the
  // one addition to it. See docs/DECISIONS.md.
  'note',
]);

// Block content is jsonb, and there are exactly two shapes in it:
//
//   { text: string }  — a plain block. A note document's title, and everything
//                       written before slice 05.
//   a TipTap node     — { type: 'paragraph', content: [...] } and friends. One
//                       top-level node of a note document, stored verbatim.
//
// Both are objects, so the schema stays deliberately open; what matters is
// that service.plainTextOf can read the text out of either, because that text
// is what content_hash — and therefore the whole staleness cascade — is made
// of.
export const blockContentSchema = z.record(z.string(), z.unknown());

export const blockSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  position: z.coerce.number(),
  type: blockTypeSchema,
  content: blockContentSchema,
  version: z.number().int(),
  content_hash: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const createBlockInputSchema = z.object({
  workspaceId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  type: blockTypeSchema,
  content: blockContentSchema.default({}),
  // Omit to append after the last sibling; pass a value (e.g. from
  // positionBetween) to insert at a specific spot.
  position: z.number().optional(),
  // Omit to let the database mint one. The editor supplies it, because the
  // node in the document already carries the id it wants — that is what makes
  // "new node -> new block" a one-way write with nothing to hand back.
  id: z.uuid().optional(),
});

export const updateBlockInputSchema = z.object({
  content: blockContentSchema,
  // A paragraph toggled into a heading is the same block with a different
  // shape. Type is not part of the hash, so this never bumps a version.
  type: blockTypeSchema.optional(),
});

export type BlockType = z.infer<typeof blockTypeSchema>;
export type BlockContent = z.infer<typeof blockContentSchema>;
export type Block = z.infer<typeof blockSchema>;
export type CreateBlockInput = z.input<typeof createBlockInputSchema>;
export type UpdateBlockInput = z.input<typeof updateBlockInputSchema>;
