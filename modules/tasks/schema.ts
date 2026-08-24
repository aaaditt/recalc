import { z } from 'zod';

// A task can hang off a course, a syllabus unit, a specific lecture, or nothing
// at all. `source_block_id` is where it came from — a sentence selected in a
// note (slice 06) or an email proposal (slice 15).
//
// docs/PRODUCT.md, "Scope boundaries": no subtasks, no dependencies, no
// recurrence, no priority. Due date and status, and that is the whole model.

export const taskStatusSchema = z.enum(['open', 'doing', 'done', 'dropped']);

/** The statuses a task is still asking something of you. */
export const LIVE_STATUSES = ['open', 'doing'] as const;

export const taskSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  course_id: z.uuid().nullable(),
  unit_id: z.uuid().nullable(),
  meeting_id: z.uuid().nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  due_at: z.string().nullable(),
  status: taskStatusSchema,
  effort_min: z.number().int().nullable(),
  source_block_id: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const createTaskInputSchema = z.object({
  workspaceId: z.uuid(),
  title: z.string().trim().min(1, 'a task needs a title'),
  courseId: z.uuid().nullable().optional(),
  unitId: z.uuid().nullable().optional(),
  meetingId: z.uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  // An instant, not a calendar date: "the essay is due 23:59 on Friday".
  dueAt: z.string().nullable().optional(),
  status: taskStatusSchema.default('open'),
  effortMin: z.number().int().positive().nullable().optional(),
  // Provenance. Written once, on creation, and never editable afterwards —
  // where a task came from is a fact about the past.
  sourceBlockId: z.uuid().nullable().optional(),
});

/**
 * Editing an existing task. Every field is optional and every optional field
 * means three things, which is deliberate:
 *
 *   absent  -> leave it as it is
 *   null    -> clear it
 *   a value -> set it
 */
export const updateTaskInputSchema = z.object({
  title: z.string().trim().min(1, 'a task needs a title').optional(),
  courseId: z.uuid().nullable().optional(),
  unitId: z.uuid().nullable().optional(),
  meetingId: z.uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  effortMin: z.number().int().positive().nullable().optional(),
});

export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type CreateTaskInput = z.input<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;
