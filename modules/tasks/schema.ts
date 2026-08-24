import { z } from 'zod';

// A task can hang off a course, a syllabus unit, a specific lecture, or nothing
// at all. `source_block_id` is where it came from — an email proposal (slice 15)
// or a todo block in a note.

export const taskStatusSchema = z.enum(['open', 'doing', 'done', 'dropped']);

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
  title: z.string().min(1),
  courseId: z.uuid().nullable().optional(),
  unitId: z.uuid().nullable().optional(),
  meetingId: z.uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  // An instant, not a calendar date: "the essay is due 23:59 on Friday".
  dueAt: z.string().nullable().optional(),
  status: taskStatusSchema.default('open'),
  effortMin: z.number().int().positive().nullable().optional(),
  sourceBlockId: z.uuid().nullable().optional(),
});

export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type CreateTaskInput = z.input<typeof createTaskInputSchema>;
