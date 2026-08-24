import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createOneOffMeeting,
  generateMeetings,
  getMeetingsBetween,
  getMeetingsOnDate,
  rescheduleMeeting,
  setMeetingStatus,
} from '@/modules/courses';
import { ensureWorkspace } from '@/modules/workspaces';

// THE database-side invariant of slice 04:
//
//   editing one meeting must never affect the others.
//
// The calendar lets a lecture be dragged, resized and cancelled. Every one of
// those is one row. If any of them reached back to the weekly pattern — or if
// the next generateMeetings run undid them — a corrected timetable would
// silently overwrite a term's worth of changes, which is the exact mistake
// docs/SCHEMA.md warns about.
//
// Real database, because RLS, the unique index and the status column are part
// of what is being proven. Throwaway user + workspace, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'meeting-edits.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

// 2026-10-05 is a Monday, so this term holds exactly three Tuesdays.
const TERM_START = '2026-10-05';
const TERM_END = '2026-10-23';
const TIME_ZONE = 'Asia/Dubai';

describe('editing one meeting leaves the others alone', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let courseId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `meeting-edits-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;

    const { data: course, error: cErr } = await db
      .from('courses')
      .insert({
        workspace_id: workspaceId,
        code: 'PH210',
        name: 'Waves and Optics',
        term: 'Fall 2026',
      })
      .select('id')
      .single();
    if (cErr) throw new Error(`could not create course: ${cErr.message}`);
    courseId = course.id;

    const { error: sErr } = await db
      .from('sessions')
      .insert([
        { course_id: courseId, weekday: 2, starts_at: '09:00', ends_at: '10:30', room: 'B204' },
      ]);
    if (sErr) throw new Error(`could not create session: ${sErr.message}`);

    await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: TERM_END,
      timeZone: TIME_ZONE,
    });
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to courses,
    // sessions and class_meetings.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('starts from three identical Tuesdays', async () => {
    const term = await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE);
    expect(term).toHaveLength(3);
    expect(term.every((meeting) => meeting.status === 'scheduled')).toBe(true);
  });

  it('moves the dragged lecture and nothing else', async () => {
    const [second] = await getMeetingsOnDate(db, workspaceId, '2026-10-13', TIME_ZONE);
    const others = (
      await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE)
    ).filter((meeting) => meeting.id !== second.id);

    // An hour later, same length — what dragging the block down does.
    const startsAt = new Date(new Date(second.starts_at).getTime() + 3_600_000);
    const endsAt = new Date(new Date(second.ends_at).getTime() + 3_600_000);

    const moved = await rescheduleMeeting(db, workspaceId, second.id, {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });

    expect(new Date(moved.starts_at).toISOString()).toBe(startsAt.toISOString());
    expect(moved.status).toBe('moved');

    const after = await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE);
    for (const before of others) {
      const now = after.find((meeting) => meeting.id === before.id);
      expect(now?.starts_at).toBe(before.starts_at);
      expect(now?.ends_at).toBe(before.ends_at);
      expect(now?.status).toBe('scheduled');
    }
  });

  it('cancels one class without hiding it and without touching the rest', async () => {
    const [first] = await getMeetingsOnDate(db, workspaceId, '2026-10-06', TIME_ZONE);

    const cancelled = await setMeetingStatus(db, workspaceId, first.id, 'cancelled');
    expect(cancelled.status).toBe('cancelled');

    // Still on the calendar — knowing a class is cancelled beats it vanishing.
    const sameDay = await getMeetingsOnDate(db, workspaceId, '2026-10-06', TIME_ZONE);
    expect(sameDay.map((meeting) => meeting.id)).toContain(first.id);

    const [third] = await getMeetingsOnDate(db, workspaceId, '2026-10-20', TIME_ZONE);
    expect(third.status).toBe('scheduled');
  });

  it('adds a one-off with no session, and finds it on its day', async () => {
    // A Friday: the weekly pattern has nothing on it.
    const oneOff = await createOneOffMeeting(db, {
      workspaceId,
      courseId,
      date: '2026-10-16',
      startsAt: '16:00',
      endsAt: '18:00',
      room: 'HALL',
      timeZone: TIME_ZONE,
    });

    expect(oneOff.session_id).toBeNull();
    // 16:00 in Asia/Dubai (UTC+4) is 12:00 UTC.
    expect(new Date(oneOff.starts_at).toISOString()).toBe('2026-10-16T12:00:00.000Z');

    const friday = await getMeetingsOnDate(db, workspaceId, '2026-10-16', TIME_ZONE);
    expect(friday.map((meeting) => meeting.id)).toEqual([oneOff.id]);
  });

  it('regenerating puts none of it back', async () => {
    const before = await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE);

    const result = await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: TERM_END,
      timeZone: TIME_ZONE,
    });

    // The moved lecture no longer sits on its pattern's day and time, so the
    // run wants to create one there — that is correct, the timetable does say
    // there is a class then. What must not happen is the moved, cancelled or
    // one-off rows changing.
    expect(result.updated).toBe(0);

    const after = await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE);
    for (const meeting of before) {
      const now = after.find((row) => row.id === meeting.id);
      expect(now, `meeting ${meeting.id} survived`).toBeDefined();
      expect(now?.starts_at).toBe(meeting.starts_at);
      expect(now?.ends_at).toBe(meeting.ends_at);
      expect(now?.status).toBe(meeting.status);
      expect(now?.room).toBe(meeting.room);
    }
  });
});
