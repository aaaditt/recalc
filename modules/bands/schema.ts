import { z } from 'zod';

// The shape of a band and of a slot inside one. See
// supabase/migrations/019_bands.sql for what a band is — and, more importantly,
// what it is not: it is a frame, never a copy of the classes it happens to
// contain.

/** A wall-clock time of day. What you would write on a piece of paper. */
export const bandTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM');

export const bandNameSchema = z
  .string()
  .trim()
  .min(1, 'a band needs a name')
  .max(40, 'that is a description, not a name');

export const bandKindSchema = z.enum(['custom', 'university']);

/** 0=Sun .. 6=Sat, `sessions.weekday`'s numbering, used everywhere in this app. */
export const weekdaySchema = z.number().int().min(0).max(6);

/**
 * The days a band runs. Sorted and de-duplicated on the way in, so
 * `[5, 1, 1]` and `[1, 5]` are the same week and are stored the same way —
 * otherwise "does this band run on Friday" depends on what order it was typed.
 */
export const weekdaysSchema = z
  .array(weekdaySchema)
  .min(1, 'a band has to run on at least one day')
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export const bandSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  kind: bandKindSchema,
  // Postgres `time` comes back as 'HH:MM:SS'.
  starts_at: z.string(),
  ends_at: z.string(),
  weekdays: z.array(z.number().int()),
  position: z.coerce.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Band = z.infer<typeof bandSchema>;

export const bandSlotSchema = z.object({
  id: z.uuid(),
  band_id: z.uuid(),
  workspace_id: z.uuid(),
  label: z.string(),
  course_id: z.uuid().nullable(),
  weekday: z.number().int(),
  starts_at: z.string(),
  ends_at: z.string(),
  created_at: z.string(),
});

export type BandSlot = z.infer<typeof bandSlotSchema>;

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export const createBandInputSchema = z.object({
  workspaceId: z.uuid(),
  name: bandNameSchema,
  startsAt: bandTimeSchema,
  endsAt: bandTimeSchema,
  weekdays: weekdaysSchema,
});

/**
 * Editing a band. `kind` is deliberately absent: a custom band cannot become
 * the university band and the university band cannot stop being it. What the
 * timetable is is not a thing a form gets to change.
 */
export const updateBandInputSchema = z.object({
  workspaceId: z.uuid(),
  bandId: z.uuid(),
  name: bandNameSchema.optional(),
  startsAt: bandTimeSchema.optional(),
  endsAt: bandTimeSchema.optional(),
  weekdays: weekdaysSchema.optional(),
});

export const slotLabelSchema = z
  .string()
  .trim()
  .min(1, 'a slot needs a name')
  .max(60, 'that is a note, not a name');

export const addSlotInputSchema = z.object({
  workspaceId: z.uuid(),
  bandId: z.uuid(),
  label: slotLabelSchema,
  courseId: z.uuid().nullable().optional(),
  weekday: weekdaySchema,
  startsAt: bandTimeSchema,
  endsAt: bandTimeSchema,
});

export const updateSlotInputSchema = z.object({
  workspaceId: z.uuid(),
  slotId: z.uuid(),
  label: slotLabelSchema.optional(),
  courseId: z.uuid().nullable().optional(),
  weekday: weekdaySchema.optional(),
  startsAt: bandTimeSchema.optional(),
  endsAt: bandTimeSchema.optional(),
});

export type CreateBandInput = z.input<typeof createBandInputSchema>;
export type UpdateBandInput = z.input<typeof updateBandInputSchema>;
export type AddSlotInput = z.input<typeof addSlotInputSchema>;
export type UpdateSlotInput = z.input<typeof updateSlotInputSchema>;

/**
 * What a band and its contents look like once read.
 *
 * `slots` is always empty for the university band, and that is not an oversight
 * — see the module doc. Its contents come from `sessions` and `class_meetings`,
 * which the calendar and /timetable already know how to read.
 */
export type BandWithSlots = Band & { slots: BandSlot[] };

/** Why a write was refused. The screen prints this, so it is a sentence. */
export class BandRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BandRuleError';
  }
}
