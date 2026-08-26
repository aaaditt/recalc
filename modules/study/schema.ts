import { z } from 'zod';

// A study session is 25 minutes against a course, and — when one was picked —
// against a syllabus unit. That optional column is the whole reason the table
// exists: minutes per unit crossed with unanswered questions per unit is the
// sentence docs/PRODUCT.md says the product is for.

/** 1 scattered · 2 ok · 3 deep. Asked once, answerable in one tap, skippable. */
export const focusRatingSchema = z.number().int().min(1).max(3);

export const studySessionSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  course_id: z.uuid(),
  unit_id: z.uuid().nullable(),
  // Instants. ended_at is never null — a row is only written once the block is
  // over, so there is no such thing as a half-logged session.
  started_at: z.string(),
  ended_at: z.string(),
  focus_rating: z.number().int().nullable(),
  created_at: z.string(),
});

/**
 * What the timer sends when a block finishes.
 *
 * The instants come from the browser, because that is where the clock the user
 * was looking at lives. The server never re-derives them and never trusts them
 * to be sane either: the service checks the order and the length.
 */
export const logStudySessionInputSchema = z.object({
  workspaceId: z.uuid(),
  courseId: z.uuid(),
  unitId: z.uuid().nullable().optional(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  focusRating: focusRatingSchema.nullable().optional(),
});

export type StudySession = z.infer<typeof studySessionSchema>;
export type FocusRating = z.infer<typeof focusRatingSchema>;
export type LogStudySessionInput = z.input<typeof logStudySessionInputSchema>;
