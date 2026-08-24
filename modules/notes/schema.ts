import { z } from 'zod';

import type { CalendarDate } from '@/lib/time';

// A note document is a `blocks` row of type 'note'. Its children are its
// top-level TipTap nodes, one block each, ordered by `position`.

/**
 * One top-level node of a TipTap document, as ProseMirror JSON.
 *
 * Deliberately loose. The editor owns this shape, and a schema that
 * enumerated every node and mark would have to be edited every time an
 * extension is configured — while proving nothing, because the only thing the
 * server does with a node is store it and read its text out. What is checked
 * is what the server acts on: that it is an object with a `type`, and that
 * `attrs.blockId` is a uuid when it is there at all.
 */
export const noteNodeSchema = z.looseObject({
  type: z.string().min(1),
  attrs: z.looseObject({ blockId: z.uuid().nullable().optional() }).optional(),
});

export type NoteNode = z.infer<typeof noteNodeSchema>;

export const standaloneNoteSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  block_id: z.uuid(),
  course_id: z.uuid().nullable(),
  unit_id: z.uuid().nullable(),
  created_at: z.string(),
});

export type StandaloneNote = z.infer<typeof standaloneNoteSchema>;

export const createStandaloneNoteInputSchema = z.object({
  workspaceId: z.uuid(),
  title: z.string().trim().min(1, 'a note needs a title'),
  courseId: z.uuid(),
  unitId: z.uuid().nullable().optional(),
});

export type CreateStandaloneNoteInput = z.input<typeof createStandaloneNoteInputSchema>;

/** The whole document, as the editor last had it. Order is document order. */
export const saveNoteInputSchema = z.object({
  nodes: z.array(noteNodeSchema),
});

export type SaveNoteInput = z.input<typeof saveNoteInputSchema>;

/** A note document and its nodes, ready to hand to the editor. */
export type NoteDocument = {
  id: string;
  title: string;
  /** The top-level TipTap nodes, in order, each carrying its own block id. */
  nodes: NoteNode[];
};

/** One line in /notes. Lecture notes and free-standing notes both land here. */
export type NoteListEntry = {
  blockId: string;
  /** A free-standing note's own title; empty for a lecture note. */
  title: string;
  courseId: string | null;
  /** Set when this note belongs to a dated lecture. */
  meetingId: string | null;
  /** The lecture's local date, when there is a lecture. */
  date: CalendarDate | null;
  /** What the list sorts on: the lecture's instant, or when the note was made. */
  at: string;
  href: string;
};
