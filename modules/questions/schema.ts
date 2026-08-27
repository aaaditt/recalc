import { z } from 'zod';

import type { CalendarDate } from '@/lib/time';
import type { DerivationStatus } from '@/modules/recalc';

// A question is a `blocks` row of type 'question'. `questions` indexes it with
// the one thing a block cannot say — where it is in its lifecycle — exactly as
// `standalone_notes` indexes a note document with its course and unit.
//
//   open     — asked, never answered
//   answered — a derivation produced an answer. STILL AN OPEN LOOP: it counts
//              everywhere "unresolved questions" are counted.
//   resolved — I pressed the button because I actually understand it. This
//              transition is never automatic.

export const questionStatusSchema = z.enum(['open', 'answered', 'resolved']);
export type QuestionStatus = z.infer<typeof questionStatusSchema>;

/** Everything that is not `resolved` is still asking something of me. */
export function isUnresolved(status: QuestionStatus): boolean {
  return status !== 'resolved';
}

export const questionSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  block_id: z.uuid(),
  status: questionStatusSchema,
  created_at: z.string(),
});
export type QuestionRow = z.infer<typeof questionSchema>;

export const questionAnchorSchema = z.object({
  question_block_id: z.uuid(),
  anchored_block_id: z.uuid(),
});
export type QuestionAnchorRow = z.infer<typeof questionAnchorSchema>;

/** A sentence, not an essay — this is typed on a phone during a lecture. */
export const questionTextSchema = z
  .string()
  .trim()
  .min(1, 'a question has to say something')
  .max(500, 'a question that long is really several questions');

export const askQuestionInputSchema = z.object({
  workspaceId: z.uuid(),
  text: questionTextSchema,
  /**
   * The blocks this question is about. At least one: a question anchored to
   * nothing has nothing to go stale against, and could never be answered.
   */
  anchorBlockIds: z.array(z.uuid()).min(1, 'a question has to be about something'),
});
export type AskQuestionInput = z.infer<typeof askQuestionInputSchema>;

// ---------------------------------------------------------------------------
// What the screens read
// ---------------------------------------------------------------------------

/**
 * One block an answer actually drew from, and where to go and read it.
 *
 * prompts/12-questions.md makes this a hard constraint: "The answer must cite
 * which of my own blocks it drew from, and link to them." These come from the
 * derivation's receipt, so they name what was read rather than what was meant.
 */
export type QuestionCitation = {
  blockId: string;
  /** What that block says now. */
  text: string;
  /** The note it lives in. Null if it is not part of a note document. */
  noteTitle: string | null;
  href: string | null;
  /** The lecture's local date, when the note belongs to a lecture. */
  date: CalendarDate | null;
};

export type QuestionAnswerView = {
  derivationId: string;
  blockId: string;
  text: string;
  status: DerivationStatus;
  error: string | null;
  model: string;
  computedAt: string | null;
  citations: QuestionCitation[];
};

export type QuestionView = {
  id: string;
  /** The question block. Every action takes this, never the `questions.id`. */
  blockId: string;
  text: string;
  status: QuestionStatus;
  createdAt: string;
  anchorBlockIds: string[];
  /** The note the question was asked in, if its anchors are in one. */
  note: { blockId: string; title: string; href: string; date: CalendarDate | null } | null;
  /**
   * Where this question sits in the semester. Both come from the note its
   * anchors live in — a lecture note takes its unit from the lecture's topic,
   * a free-standing note from its own row. There is no third place.
   */
  courseId: string | null;
  unitId: string | null;
  answer: QuestionAnswerView | null;
};
