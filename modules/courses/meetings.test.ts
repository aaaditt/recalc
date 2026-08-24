import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateMeetings, getMeetingsOnDate, getMeetingsBetween } from '@/modules/courses';
import { createBlock } from '@/modules/blocks';
import { ensureWorkspace } from '@/modules/workspaces';

// THE test for slice 01. Meeting generation must be idempotent: running it
// twice never duplicates a lecture, and it never modifies a lecture that has
// been hand-edited — a note, a topic, a unit, a cancellation. Regenerating over
// those is what orphans a term's worth of notes and files.
//
// Real database, because the unique index and the RLS-free service-role path
// are part of what is being proven. Throwaway user + workspace, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'meetings.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

// Fixed so the test does not drift with the calendar. 2026-10-05 is a Monday,
// so the term below covers exactly three Tuesdays and three Thursdays.
const TERM_START = '2026-10-05';
const TERM_END = '2026-10-23';
const TIME_ZONE = 'Asia/Dubai';

describe('meeting generation is idempotent', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let courseId: string;
  let tueSessionId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `meetings-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;

    const { data: course, error: cErr } = await db
      .from('courses')
      .insert({
        workspace_id: workspaceId,
        code: 'ME301',
        name: 'Thermodynamics',
        term: 'Fall 2026',
      })
      .select('id')
      .single();
    if (cErr) throw new Error(`could not create course: ${cErr.message}`);
    courseId = course.id;

    // The same course twice a week at different times — the case SCHEMA.md
    // calls out and a single recurrence column could not express.
    const { data: sessions, error: sErr } = await db
      .from('sessions')
      .insert([
        { course_id: courseId, weekday: 2, starts_at: '09:00', ends_at: '10:30', room: 'B204' },
        { course_id: courseId, weekday: 4, starts_at: '14:00', ends_at: '15:00', room: 'LAB1' },
      ])
      .select('id, weekday');
    if (sErr) throw new Error(`could not create sessions: ${sErr.message}`);
    tueSessionId = sessions.find((s) => s.weekday === 2)!.id;
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to courses,
    // sessions and class_meetings.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  async function meetingCount(): Promise<number> {
    const { count, error } = await db
      .from('class_meetings')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  it('generates one meeting per session per matching day', async () => {
    const result = await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: TERM_END,
      timeZone: TIME_ZONE,
    });

    // Tuesdays 6, 13, 20 October and Thursdays 8, 15, 22 October.
    expect(result.created).toBe(6);
    expect(await meetingCount()).toBe(6);

    const tuesday = await getMeetingsOnDate(db, workspaceId, '2026-10-06', TIME_ZONE);
    expect(tuesday).toHaveLength(1);
    expect(tuesday[0].room).toBe('B204');
    // 09:00 in Asia/Dubai (UTC+4) is 05:00 UTC.
    expect(new Date(tuesday[0].starts_at).toISOString()).toBe('2026-10-06T05:00:00.000Z');
  });

  it('a second run creates nothing and changes nothing', async () => {
    const before = await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE);

    const result = await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: TERM_END,
      timeZone: TIME_ZONE,
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(6);
    expect(await meetingCount()).toBe(6);

    const after = await getMeetingsBetween(db, workspaceId, TERM_START, TERM_END, TIME_ZONE);
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
  });

  it('never overwrites or duplicates a meeting that has a note attached', async () => {
    const [meeting] = await getMeetingsOnDate(db, workspaceId, '2026-10-13', TIME_ZONE);
    const note = await createBlock(db, {
      workspaceId,
      type: 'text',
      content: { text: 'Notes from the 13 October lecture.' },
    });

    // A hand-edited lecture: it has a note, it moved room, and it was moved.
    const { error } = await db
      .from('class_meetings')
      .update({ note_block_id: note.id, room: 'C110', status: 'moved', topic: 'Entropy' })
      .eq('id', meeting.id);
    if (error) throw new Error(error.message);

    const result = await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: TERM_END,
      timeZone: TIME_ZONE,
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(await meetingCount()).toBe(6);

    const [again] = await getMeetingsOnDate(db, workspaceId, '2026-10-13', TIME_ZONE);
    expect(again.id).toBe(meeting.id);
    expect(again.note_block_id).toBe(note.id);
    expect(again.room).toBe('C110');
    expect(again.status).toBe('moved');
    expect(again.topic).toBe('Entropy');
  });

  it('moves an untouched meeting when the timetable is corrected, without duplicating it', async () => {
    // The Tuesday class was actually at 11:00 in B310 all along.
    const { error } = await db
      .from('sessions')
      .update({ starts_at: '11:00', ends_at: '12:30', room: 'B310' })
      .eq('id', tueSessionId);
    if (error) throw new Error(error.message);

    const result = await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: TERM_END,
      timeZone: TIME_ZONE,
    });

    // Three Tuesdays: two untouched ones move, the one with the note does not.
    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);
    expect(await meetingCount()).toBe(6);

    const [moved] = await getMeetingsOnDate(db, workspaceId, '2026-10-06', TIME_ZONE);
    expect(new Date(moved.starts_at).toISOString()).toBe('2026-10-06T07:00:00.000Z');
    expect(moved.room).toBe('B310');

    const [kept] = await getMeetingsOnDate(db, workspaceId, '2026-10-13', TIME_ZONE);
    expect(new Date(kept.starts_at).toISOString()).toBe('2026-10-13T05:00:00.000Z');
    expect(kept.room).toBe('C110');
  });

  it('extending the term adds only the new days', async () => {
    const result = await generateMeetings(db, {
      workspaceId,
      termStart: TERM_START,
      termEnd: '2026-10-30', // one more Tuesday and one more Thursday
      timeZone: TIME_ZONE,
    });

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(await meetingCount()).toBe(8);
  });
});
