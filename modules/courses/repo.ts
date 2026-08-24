import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classMeetingSchema,
  courseSchema,
  sessionSchema,
  syllabusUnitSchema,
  type ClassMeeting,
  type Course,
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

export type NewMeetingRow = {
  workspace_id: string;
  course_id: string;
  session_id: string;
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
