import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classMeetingSchema,
  courseSchema,
  sessionSchema,
  syllabusUnitSchema,
  type ClassMeeting,
  type Course,
  type MeetingStatus,
  type Session,
  type SyllabusUnit,
} from './schema';

// The only file that touches courses, sessions, syllabus_units and
// class_meetings. Nothing here decides *what* a meeting should be — that is
// service.ts.

export async function listCourses(
  db: SupabaseClient,
  workspaceId: string,
  term?: string
): Promise<Course[]> {
  let query = db
    .from('courses')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('code', { ascending: true });
  if (term) query = query.eq('term', term);

  const { data, error } = await query;
  if (error) throw new Error(`courses.listCourses: ${error.message}`);
  return (data ?? []).map((row) => courseSchema.parse(row));
}

export async function listSessions(
  db: SupabaseClient,
  courseIds: string[]
): Promise<Session[]> {
  if (courseIds.length === 0) return [];
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .in('course_id', courseIds)
    .order('weekday', { ascending: true })
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`courses.listSessions: ${error.message}`);
  return (data ?? []).map((row) => sessionSchema.parse(row));
}

export async function listSyllabusUnits(
  db: SupabaseClient,
  courseId: string
): Promise<SyllabusUnit[]> {
  const { data, error } = await db
    .from('syllabus_units')
    .select('*')
    .eq('course_id', courseId)
    .order('position', { ascending: true });
  if (error) throw new Error(`courses.listSyllabusUnits: ${error.message}`);
  return (data ?? []).map((row) => syllabusUnitSchema.parse(row));
}

/** One syllabus unit by id, or null. */
export async function findSyllabusUnit(
  db: SupabaseClient,
  id: string
): Promise<SyllabusUnit | null> {
  const { data, error } = await db
    .from('syllabus_units')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`courses.findSyllabusUnit: ${error.message}`);
  return data ? syllabusUnitSchema.parse(data) : null;
}

/** Every lecture that has a note document, most recent lecture first. */
export async function listMeetingsWithNotes(
  db: SupabaseClient,
  workspaceId: string
): Promise<ClassMeeting[]> {
  const { data, error } = await db
    .from('class_meetings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .not('note_block_id', 'is', null)
    .order('starts_at', { ascending: false });
  if (error) throw new Error(`courses.listMeetingsWithNotes: ${error.message}`);
  return (data ?? []).map((row) => classMeetingSchema.parse(row));
}

/** Meetings starting inside the half-open instant range [startsAt, endsAt). */
export async function listMeetingsBetween(
  db: SupabaseClient,
  workspaceId: string,
  startsAt: string,
  endsAt: string
): Promise<ClassMeeting[]> {
  const { data, error } = await db
    .from('class_meetings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', startsAt)
    .lt('starts_at', endsAt)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`courses.listMeetingsBetween: ${error.message}`);
  return (data ?? []).map((row) => classMeetingSchema.parse(row));
}

/** Every meeting already generated from one of these weekly patterns. */
export async function listMeetingsForSessions(
  db: SupabaseClient,
  sessionIds: string[],
  startsAt: string,
  endsAt: string
): Promise<ClassMeeting[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await db
    .from('class_meetings')
    .select('*')
    .in('session_id', sessionIds)
    .gte('starts_at', startsAt)
    .lt('starts_at', endsAt)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`courses.listMeetingsForSessions: ${error.message}`);
  return (data ?? []).map((row) => classMeetingSchema.parse(row));
}

/** One course by id, or null when it is not this workspace's. */
export async function findCourse(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Course | null> {
  const { data, error } = await db
    .from('courses')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`courses.findCourse: ${error.message}`);
  return data ? courseSchema.parse(data) : null;
}

/** One meeting by id, or null. Scoped by workspace so RLS is not the only guard. */
export async function findMeeting(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<ClassMeeting | null> {
  const { data, error } = await db
    .from('class_meetings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`courses.findMeeting: ${error.message}`);
  return data ? classMeetingSchema.parse(data) : null;
}

export type NewMeetingRow = {
  workspace_id: string;
  course_id: string;
  /** Null for a one-off: a make-up class, a guest lecture, an exam. */
  session_id: string | null;
  starts_at: string;
  ends_at: string;
  room: string | null;
};

export async function insertMeetings(
  db: SupabaseClient,
  rows: NewMeetingRow[]
): Promise<ClassMeeting[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db.from('class_meetings').insert(rows).select('*');
  if (error) throw new Error(`courses.insertMeetings: ${error.message}`);
  return (data ?? []).map((row) => classMeetingSchema.parse(row));
}

export async function updateMeetingSchedule(
  db: SupabaseClient,
  id: string,
  patch: { starts_at: string; ends_at: string; room: string | null }
): Promise<ClassMeeting> {
  const { data, error } = await db
    .from('class_meetings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`courses.updateMeetingSchedule: ${error.message}`);
  return classMeetingSchema.parse(data);
}

/**
 * Move or resize one dated lecture. `.eq('id', ...)` and nothing else: the
 * weekly pattern is not consulted and no sibling meeting is in the statement,
 * which is what makes "editing one meeting never affects the others" true.
 */
export async function updateMeetingTimes(
  db: SupabaseClient,
  id: string,
  patch: { starts_at: string; ends_at: string }
): Promise<ClassMeeting> {
  const { data, error } = await db
    .from('class_meetings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`courses.updateMeetingTimes: ${error.message}`);
  return classMeetingSchema.parse(data);
}

/** Point a lecture at its note document. Written once, on the first save. */
export async function updateMeetingNoteBlock(
  db: SupabaseClient,
  id: string,
  noteBlockId: string
): Promise<ClassMeeting> {
  const { data, error } = await db
    .from('class_meetings')
    .update({ note_block_id: noteBlockId })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`courses.updateMeetingNoteBlock: ${error.message}`);
  return classMeetingSchema.parse(data);
}

/** Which syllabus unit this lecture covered. Null clears it. */
export async function updateMeetingUnit(
  db: SupabaseClient,
  id: string,
  unitId: string | null
): Promise<ClassMeeting> {
  const { data, error } = await db
    .from('class_meetings')
    .update({ unit_id: unitId })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`courses.updateMeetingUnit: ${error.message}`);
  return classMeetingSchema.parse(data);
}

export async function updateMeetingStatus(
  db: SupabaseClient,
  id: string,
  status: MeetingStatus
): Promise<ClassMeeting> {
  const { data, error } = await db
    .from('class_meetings')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`courses.updateMeetingStatus: ${error.message}`);
  return classMeetingSchema.parse(data);
}
