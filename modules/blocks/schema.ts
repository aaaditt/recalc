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
]);

// Block content is jsonb. For now the only shape the app writes is { text: string };
// richer TipTap documents arrive in slice 05.
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
});

export const updateBlockInputSchema = z.object({
  content: blockContentSchema,
});

export type BlockType = z.infer<typeof blockTypeSchema>;
export type BlockContent = z.infer<typeof blockContentSchema>;
export type Block = z.infer<typeof blockSchema>;
export type CreateBlockInput = z.input<typeof createBlockInputSchema>;
export type UpdateBlockInput = z.input<typeof updateBlockInputSchema>;
