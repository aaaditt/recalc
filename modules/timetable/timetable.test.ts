import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createBlock } from '@/modules/blocks';
import {
  getMeetingsForSession,
  getSessions,
  setMeetingNote,
  type ClassMeeting,
} from '@/modules/courses';
import { addClass, getPeriods, removeClass, updateClass } from '@/modules/timetable';
import { ensureWorkspace, setTerm } from '@/modules/workspaces';

// THE test for slice 16.
//
// docs/SCHEMA.md: "Meetings are generated once at the start of term from
// sessions + term dates, then edited individually. Never regenerate them
// wholesale afterwards — that would destroy the notes and files attached to
// them."
//
// /timetable is the first screen that regenerates from inside an edit, so it is
// the first place that sentence can be broken by a button. Every assertion
// below is about the same thing from a different angle: a lecture that carries
// work is never deleted, never rewritten, and never duplicated, whatever is
// done to the timetable it came from.
//
// (a) is the control case. If generation is ever changed to truncate-and-
// rebuild, the id comparison in "the noted lecture survives a change to the
// class" fails — a new row would have a new id even if everything else about it
// matched.
//
// Real database, because the unique index, the `on delete set null` foreign key
// and the RLS-free service-role path are all part of what is being proved.
// Throwaway user + workspace, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'timetable.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

// A term far enough ahead that "the rest of term" is the whole of it, whatever
// day this test is run on — and fixed, so the counts below never drift.
// 2030-10-07 is a Monday; the window holds exactly three Tuesdays: 8, 15, 22.
const TERM_START = '2030-10-07';
const TERM_END = '2030-10-27';
const TIME_ZONE = 'Asia/Dubai';
const TUESDAY = 2;

describe('the timetable never destroys a lecture that carries work', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let periodId: string;
  let sessionId: string;
  let notedMeetingId: string;
  let noteBlockId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `timetable-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;
    await setTerm(db, workspaceId, { termStart: TERM_START, termEnd: TERM_END });
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to periods,
    // courses, sessions and class_meetings.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  async function meetings(): Promise<ClassMeeting[]> {
    return getMeetingsForSession(db, workspaceId, sessionId);
  }

  it('seeds the nine periods off the printed timetable, once', async () => {
    const periods = await getPeriods(db, workspaceId);

    expect(periods).toHaveLength(9);
    expect(periods[0].label).toBe('1st');
    expect(periods[0].starts_at.slice(0, 5)).toBe('07:30');
    expect(periods[0].ends_at.slice(0, 5)).toBe('08:20');
    expect(periods[8].label).toBe('9th');
    expect(periods[8].ends_at.slice(0, 5)).toBe('15:40');

    // Idempotent: a second render of /timetable does not seed a second nine.
    expect(await getPeriods(db, workspaceId)).toHaveLength(9);

    periodId = periods[0].id;
  });

  it('adding a class writes the weekly slot and this term’s lectures', async () => {
    const added = await addClass(db, {
      workspaceId,
      periodId,
      weekday: TUESDAY,
      room: '257',
      isLab: false,
      newCourse: { code: 'CS201', name: 'Data Structures', colour: 'rose', term: 'Fall 2030' },
      timeZone: TIME_ZONE,
    });

    sessionId = added.session.id;

    // The weekly pattern took its times from the period, not from a form.
    expect(added.session.weekday).toBe(TUESDAY);
    expect(added.session.starts_at.slice(0, 5)).toBe('07:30');
    expect(added.session.room).toBe('257');
    expect(added.session.period_id).toBe(periodId);

    // Three Tuesdays in the term.
    expect(added.generated?.created).toBe(3);
    expect(await meetings()).toHaveLength(3);

    // 07:30 in Asia/Dubai (UTC+4) is 03:30 UTC — the timezone is applied once,
    // when the dated lectures are made, exactly as docs/SEEDING.md says.
    const first = (await meetings())[0];
    expect(new Date(first.starts_at).toISOString()).toBe('2030-10-08T03:30:00.000Z');
  });

  it('attaches a note to the middle lecture', async () => {
    const all = await meetings();
    notedMeetingId = all[1].id;

    const note = await createBlock(db, {
      workspaceId,
      type: 'text',
      content: { text: 'Notes from the 15 October lecture.' },
    });
    noteBlockId = note.id;

    const updated = await setMeetingNote(db, workspaceId, notedMeetingId, note.id);
    expect(updated.note_block_id).toBe(note.id);
  });

  // (a) THE CONTROL CASE.
  it('the noted lecture survives a change to the class, with the same id', async () => {
    const before = await meetings();

    await updateClass(db, {
      workspaceId,
      sessionId,
      room: '303',
      isLab: true,
      timeZone: TIME_ZONE,
    });

    const after = await meetings();

    // Nothing was rebuilt: same three rows, same three ids, same order.
    expect(after.map((meeting) => meeting.id)).toEqual(before.map((meeting) => meeting.id));

    const noted = after.find((meeting) => meeting.id === notedMeetingId);
    expect(noted).toBeDefined();
    expect(noted!.note_block_id).toBe(noteBlockId);
    // A lecture that has been written on keeps the room it actually happened
    // in. Correcting the timetable afterwards does not rewrite history.
    expect(noted!.room).toBe('257');

    // The untouched ones follow the corrected pattern.
    const untouched = after.filter((meeting) => meeting.id !== notedMeetingId);
    expect(untouched).toHaveLength(2);
    for (const meeting of untouched) expect(meeting.room).toBe('303');
  });

  // (b)
  it('re-running generation twice creates no duplicate lectures', async () => {
    const before = await meetings();

    await updateClass(db, { workspaceId, sessionId, room: '303', timeZone: TIME_ZONE });
    await updateClass(db, { workspaceId, sessionId, room: '303', timeZone: TIME_ZONE });

    const after = await meetings();
    expect(after).toHaveLength(3);
    expect(after.map((meeting) => meeting.id)).toEqual(before.map((meeting) => meeting.id));
  });

  // (c)
  it('removing a class keeps every lecture that has a note on it', async () => {
    const result = await removeClass(db, workspaceId, sessionId);

    // Two future, untouched lectures went. The one with the note stayed.
    expect(result.removed).toBe(2);
    expect(result.kept).toBe(1);

    // The weekly slot itself is gone from the grid.
    const sessions = await getSessions(db, workspaceId);
    expect(sessions.map((session) => session.id)).not.toContain(sessionId);

    // And the noted lecture is still there, with its note, under its own id.
    // `session_id` is `on delete set null`, so it survives the pattern it came
    // from — this is the row a note, a file or a task hangs off.
    const { data, error } = await db
      .from('class_meetings')
      .select('*')
      .eq('id', notedMeetingId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    expect(data).not.toBeNull();
    expect(data!.note_block_id).toBe(noteBlockId);
    expect(data!.session_id).toBeNull();
    expect(data!.room).toBe('257');
  });

  it('a lecture that has already happened is kept too', async () => {
    // The same shape, in a term that is already over: nothing in it is in the
    // future, so removing the class deletes none of it.
    await setTerm(db, workspaceId, { termStart: '2020-10-05', termEnd: '2020-10-23' });

    const added = await addClass(db, {
      workspaceId,
      periodId,
      weekday: TUESDAY,
      room: 'B204',
      newCourse: { code: 'CS202', name: 'Discrete Maths', term: 'Fall 2030' },
      timeZone: TIME_ZONE,
    });

    // The term ended before today, so "the rest of term" is nothing at all.
    expect(added.generated).toEqual({ created: 0, updated: 0, unchanged: 0 });

    // Put one dated lecture in the past by hand, the way slice 01 seeded them.
    const { data: past, error } = await db
      .from('class_meetings')
      .insert({
        workspace_id: workspaceId,
        course_id: added.session.course_id,
        session_id: added.session.id,
        starts_at: '2020-10-06T03:30:00.000Z',
        ends_at: '2020-10-06T04:20:00.000Z',
        room: 'B204',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const result = await removeClass(db, workspaceId, added.session.id);
    expect(result.removed).toBe(0);
    expect(result.kept).toBe(1);

    const { data: still } = await db
      .from('class_meetings')
      .select('id')
      .eq('id', past.id)
      .maybeSingle();
    expect(still).not.toBeNull();
  });
});
