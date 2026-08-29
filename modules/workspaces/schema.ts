import { z } from 'zod';

export const workspaceSchema = z.object({
  id: z.uuid(),
  owner_id: z.uuid(),
  name: z.string(),
  // When the current term runs, as plain calendar dates. Null until it has been
  // set. Slice 16 put them here because expanding the weekly grid into dated
  // lectures needs them on every "add a class", and re-typing them into a form
  // each time is exactly the friction that slice exists to remove.
  term_start: z.iso.date().nullable(),
  term_end: z.iso.date().nullable(),
  created_at: z.string(),
});

/**
 * The term window. Either both dates or neither — a start with no end is a
 * range that cannot be expanded into lectures, so it is refused rather than
 * stored and tripped over later.
 */
export const termInputSchema = z
  .object({
    termStart: z.iso.date().nullable(),
    termEnd: z.iso.date().nullable(),
  })
  .refine((term) => (term.termStart === null) === (term.termEnd === null), {
    message: 'a term needs both a start and an end, or neither',
  })
  .refine((term) => term.termStart === null || term.termEnd! >= term.termStart, {
    message: 'the term ends before it starts',
  });

export type Workspace = z.infer<typeof workspaceSchema>;
export type TermInput = z.infer<typeof termInputSchema>;
