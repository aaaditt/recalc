import { z } from 'zod';

// The semester layer. `sessions` is the weekly pattern; `classMeetings` are the
// dated lectures generated from it. See docs/SCHEMA.md — they are not the same
// thing and must not be collapsed into one.

export const courseSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  term: z.string(),
  colour: z.string().nullable(),
  instructor: z.string().nullable(),
  // numeric in Postgres, so coerce the same way blocks.position does.
  credits: z.coerce.number().nullable(),
  created_at: z.string(),
});

// 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat. Spelled out in docs/SEEDING.md.
export const weekdaySchema = z.number().int().min(0).max(6);

export const sessionSchema = z.object({
  id: z.uuid(),
  course_id: z.uuid(),
  weekday: weekdaySchema,
  // Wall-clock times of day, 'HH:MM:SS'. No date, no timezone.
  starts_at: z.string(),
  ends_at: z.string(),
  room: z.string().nullable(),
  valid_from: z.string().nullable(),
  valid_until: z.string().nullable(),
  // Slice 16. Which row of the printed period grid this slot sits on — a
  // convenience for /timetable, never the source of truth for the time.
  // starts_at/ends_at stay authoritative, so editing a period later cannot
  // silently move lectures that have already been generated.
  period_id: z.uuid().nullable(),
  is_lab: z.boolean(),
  created_at: z.string(),
});

/** A subject code, as it is written on the printed timetable. */
export const courseCodeSchema = z
  .string()
  .trim()
  .min(1, 'a course needs a code')
  .max(20, 'that is a name, not a code');

export const courseNameSchema = z
  .string()
  .trim()
  .min(1, 'a course needs a name')
  .max(120, 'that is a syllabus, not a course name');

/** A room, as written in the little number in the corner of the cell: '257'. */
export const roomSchema = z.string().trim().max(40).nullable().optional();

export const createCourseInputSchema = z.object({
  workspaceId: z.uuid(),
  code: courseCodeSchema,
  name: courseNameSchema,
  term: z.string().trim().min(1).max(60),
  // A course-colour token name from lib/course-colours, never a hex value.
  colour: z.string().trim().min(1).max(20).nullable().optional(),
});

/** One weekly slot: this course, this weekday, between these two times. */
export const createSessionInputSchema = z.object({
  workspaceId: z.uuid(),
  courseId: z.uuid(),
  weekday: weekdaySchema,
  startsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM'),
  endsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM'),
  room: roomSchema,
  isLab: z.boolean().optional(),
  periodId: z.uuid().nullable().optional(),
});

/** What a filled cell's edit form can change. Everything is optional. */
export const updateSessionInputSchema = z.object({
  courseId: z.uuid().optional(),
  weekday: weekdaySchema.optional(),
  startsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  endsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  room: roomSchema,
  isLab: z.boolean().optional(),
  periodId: z.uuid().nullable().optional(),
});

export const syllabusUnitStatusSchema = z.enum([
  'not_started',
  'shaky',
  'comfortable',
  'mastered',
]);

export const syllabusUnitSchema = z.object({
  id: z.uuid(),
  course_id: z.uuid(),
  position: z.coerce.number(),
  title: z.string(),
  status: syllabusUnitStatusSchema,
  block_id: z.uuid().nullable(),
  created_at: z.string(),
});

/**
 * A unit's title. Trimmed, because it is typed straight off a PDF and a
 * trailing space is not a different unit. Capped so a paste of the whole
 * syllabus into one box is refused rather than stored as one enormous line.
 */
export const syllabusUnitTitleSchema = z
  .string()
  .trim()
  .min(1, 'a unit needs a title')
  .max(200, 'that is a syllabus, not a unit title');

export const createSyllabusUnitInputSchema = z.object({
  workspaceId: z.uuid(),
  courseId: z.uuid(),
  title: syllabusUnitTitleSchema,
});

/** One step up or down the list. The whole of reordering, from the UI's side. */
export const unitMoveSchema = z.enum(['up', 'down']);

export const meetingStatusSchema = z.enum(['scheduled', 'cancelled', 'moved', 'held']);

export const classMeetingSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  course_id: z.uuid(),
  session_id: z.uuid().nullable(),
  // Instants, not wall-clock times.
  starts_at: z.string(),
  ends_at: z.string(),
  room: z.string().nullable(),
  topic: z.string().nullable(),
  unit_id: z.uuid().nullable(),
  status: meetingStatusSchema,
  note_block_id: z.uuid().nullable(),
  created_at: z.string(),
});

export const generateMeetingsInputSchema = z.object({
  workspaceId: z.uuid(),
  // Inclusive calendar dates, 'YYYY-MM-DD'.
  termStart: z.iso.date(),
  termEnd: z.iso.date(),
  // IANA zone the timetable's wall-clock times are written in. Defaults to the
  // machine's zone in the service; passed explicitly by tests.
  timeZone: z.string().min(1).optional(),
  // Limit to one term's courses. Omit for every course in the workspace.
  term: z.string().min(1).optional(),
});

/**
 * A lecture that is not part of the weekly pattern: a make-up class, a guest
 * lecture, an exam. `session_id` stays null, so `generateMeetings` never sees
 * it and never touches it.
 */
export const createOneOffMeetingInputSchema = z.object({
  workspaceId: z.uuid(),
  courseId: z.uuid(),
  // The local day it happens on, and the wall-clock times it runs between.
  date: z.iso.date(),
  startsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM'),
  endsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM'),
  room: z.string().trim().min(1).nullable().optional(),
  timeZone: z.string().min(1).optional(),
});

/** Moving or resizing exactly one meeting. Instants, because it is dated. */
export const rescheduleMeetingInputSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});

export type Course = z.infer<typeof courseSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type CreateCourseInput = z.input<typeof createCourseInputSchema>;
export type CreateSessionInput = z.input<typeof createSessionInputSchema>;
export type UpdateSessionInput = z.input<typeof updateSessionInputSchema>;
export type SyllabusUnit = z.infer<typeof syllabusUnitSchema>;
export type SyllabusUnitStatus = z.infer<typeof syllabusUnitStatusSchema>;
export type CreateSyllabusUnitInput = z.input<typeof createSyllabusUnitInputSchema>;
export type UnitMove = z.infer<typeof unitMoveSchema>;
export type ClassMeeting = z.infer<typeof classMeetingSchema>;
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type GenerateMeetingsInput = z.input<typeof generateMeetingsInputSchema>;
export type CreateOneOffMeetingInput = z.input<typeof createOneOffMeetingInputSchema>;
export type RescheduleMeetingInput = z.input<typeof rescheduleMeetingInputSchema>;

/** What a run of generateMeetings did. All three are zero on a no-op re-run. */
export type GenerateMeetingsResult = {
  created: number;
  /** Untouched meetings whose time or room drifted back into line. */
  updated: number;
  /** Meetings left exactly as they were, hand-edited ones included. */
  unchanged: number;
};
