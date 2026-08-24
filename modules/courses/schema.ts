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
  created_at: z.string(),
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

export type Course = z.infer<typeof courseSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SyllabusUnit = z.infer<typeof syllabusUnitSchema>;
export type SyllabusUnitStatus = z.infer<typeof syllabusUnitStatusSchema>;
export type ClassMeeting = z.infer<typeof classMeetingSchema>;
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type GenerateMeetingsInput = z.input<typeof generateMeetingsInputSchema>;

/** What a run of generateMeetings did. All three are zero on a no-op re-run. */
export type GenerateMeetingsResult = {
  created: number;
  /** Untouched meetings whose time or room drifted back into line. */
  updated: number;
  /** Meetings left exactly as they were, hand-edited ones included. */
  unchanged: number;
};
