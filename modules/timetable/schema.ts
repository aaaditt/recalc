import { z } from 'zod';

// The period grid. See supabase/migrations/012_timetable.sql for what a period
// is and — more importantly — what it is not.

export const periodSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  position: z.coerce.number().int(),
  label: z.string(),
  // Wall-clock times of day, 'HH:MM:SS'. No date, no timezone.
  starts_at: z.string(),
  ends_at: z.string(),
  created_at: z.string(),
});

export type Period = z.infer<typeof periodSchema>;

/**
 * The nine periods off last_sem.jpeg — fifty minutes each, five minutes apart.
 *
 * They are also seeded by migration 012 for any workspace that already existed.
 * This copy is what a workspace created *after* that migration gets, which on
 * the live (empty) database is the path that will actually run. Data, not
 * layout: nothing in /components knows these numbers.
 */
export const DEFAULT_PERIODS: { position: number; label: string; startsAt: string; endsAt: string }[] =
  [
    { position: 1, label: '1st', startsAt: '07:30', endsAt: '08:20' },
    { position: 2, label: '2nd', startsAt: '08:25', endsAt: '09:15' },
    { position: 3, label: '3rd', startsAt: '09:20', endsAt: '10:10' },
    { position: 4, label: '4th', startsAt: '10:15', endsAt: '11:05' },
    { position: 5, label: '5th', startsAt: '11:10', endsAt: '12:00' },
    { position: 6, label: '6th', startsAt: '12:05', endsAt: '12:55' },
    { position: 7, label: '7th', startsAt: '13:00', endsAt: '13:50' },
    { position: 8, label: '8th', startsAt: '13:55', endsAt: '14:45' },
    { position: 9, label: '9th', startsAt: '14:50', endsAt: '15:40' },
  ];

// ---------------------------------------------------------------------------
// Editing the grid itself — slice 17
// ---------------------------------------------------------------------------

/** A wall-clock time of day. What is written in the Timings column on paper. */
export const periodTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM');

/** What the paper calls the row: '1st', '9th', '+1'. Short, because it is a heading. */
export const periodLabelSchema = z
  .string()
  .trim()
  .min(1, 'a period needs a label')
  .max(12, 'that is a name, not a row heading');

export const addPeriodInputSchema = z.object({
  workspaceId: z.uuid(),
  label: periodLabelSchema,
  startsAt: periodTimeSchema,
  endsAt: periodTimeSchema,
});

/** Correcting a row's times or its label. Nothing else about a period exists. */
export const updatePeriodInputSchema = z.object({
  workspaceId: z.uuid(),
  periodId: z.uuid(),
  label: periodLabelSchema.optional(),
  startsAt: periodTimeSchema.optional(),
  endsAt: periodTimeSchema.optional(),
});

export type AddPeriodInput = z.input<typeof addPeriodInputSchema>;
export type UpdatePeriodInput = z.input<typeof updatePeriodInputSchema>;

/**
 * How much of the grid one period row is actually carrying.
 *
 * `outOfStep` is the number that earns this type: classes still filed under
 * this row whose own times no longer match it, because the row was edited
 * afterwards. That is not a bug — see the module doc — but it is a thing to be
 * told about, and the number the "apply to these classes" button is drawn from.
 */
export type PeriodUsage = {
  periodId: string;
  classes: number;
  outOfStep: number;
};

/** What an explicit "apply this row's times to its classes" run actually did. */
export type ApplyPeriodResult = {
  /** Weekly slots whose times were rewritten. */
  classes: number;
  /** Null when term dates are not set, so no dated lecture could be made. */
  generated: { created: number; updated: number; unchanged: number } | null;
};

/**
 * What happened when a course was asked to be deleted.
 *
 * `removed: false` is the ordinary answer for any course that has been used:
 * deleting a course cascades to its lectures, and a lecture is what a note
 * hangs off. The counts are the refusal's reason, so the screen can say what is
 * in the way rather than "no".
 */
export type RemoveCourseResult = {
  removed: boolean;
  notes: number;
  lecturesWithWork: number;
  files: number;
  tasks: number;
};

/**
 * Adding a class from a grid cell.
 *
 * Either an existing course (`courseId`) or a new one typed into the same form
 * (`newCourse`) — the fast path is "click the empty cell at 3rd × Wednesday,
 * type MP&I, done", and being sent to a course screen first would defeat it.
 */
export const addClassInputSchema = z
  .object({
    workspaceId: z.uuid(),
    periodId: z.uuid(),
    weekday: z.number().int().min(0).max(6),
    room: z.string().trim().max(40).nullable().optional(),
    isLab: z.boolean().optional(),
    courseId: z.uuid().optional(),
    newCourse: z
      .object({
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(120),
        colour: z.string().trim().min(1).max(20).nullable().optional(),
        term: z.string().trim().min(1).max(60).optional(),
      })
      .optional(),
    // The zone the printed timetable's times are written in. Asia/Dubai in
    // practice; passed explicitly by tests, and by anything that must not
    // depend on what TZ the process happens to run under.
    timeZone: z.string().min(1).optional(),
  })
  .refine((input) => Boolean(input.courseId) !== Boolean(input.newCourse), {
    message: 'pick an existing course or describe a new one, not both and not neither',
  });

/** Editing a filled cell. The period and the weekday are the cell itself. */
export const updateClassInputSchema = z.object({
  workspaceId: z.uuid(),
  sessionId: z.uuid(),
  courseId: z.uuid().optional(),
  periodId: z.uuid().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  room: z.string().trim().max(40).nullable().optional(),
  isLab: z.boolean().optional(),
  timeZone: z.string().min(1).optional(),
});

export type AddClassInput = z.input<typeof addClassInputSchema>;
export type UpdateClassInput = z.input<typeof updateClassInputSchema>;

/**
 * What removing a class actually did.
 *
 * `kept` is the number that matters: lectures that were left alone because they
 * carry a note, a topic, a syllabus unit, a file, a task, or because they have
 * already happened. Nothing in that list is ever deleted.
 */
export type RemoveClassResult = {
  removed: number;
  kept: number;
};
