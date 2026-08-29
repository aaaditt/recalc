import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createBlock, getBlock } from '@/modules/blocks';
import {
  createSyllabusUnit,
  getSession,
  getSyllabusUnits,
  removeSyllabusUnit,
  setMeetingNote,
  getMeetingsForSession,
  type ClassMeeting,
} from '@/modules/courses';
import {
  addClass,
  addPeriod,
  applyPeriodToClasses,
  getPeriods,
  getPeriodUsage,
  removeCourse,
  removePeriod,
  updatePeriod,
} from '@/modules/timetable';
import { ensureWorkspace, setTerm } from '@/modules/workspaces';

// THE test for slice 17.
//
// Slice 16 made a deliberate decision and this file is the thing that stops a
// later session undoing it: `sessions.starts_at` is authoritative, and a
// period's times are COPIED INTO the session when a class is added. The grid
// does not read a lecture's time through a join.
//
// The reason is the whole product. If editing the 3rd period's start from 09:20
// to 09:00 silently moved every lecture already generated from it, the notes and
// files attached to those lectures would end up filed against the wrong times —
// and there is no undo for that.
//
// So:
//   (a) editing a period changes the row heading and NOTHING dated. This is the
//       control case. If a period edit is ever made to cascade, the instant
//       comparison and the id comparison below both fail.
//   (b) a class added AFTER the edit gets the NEW times, which is the whole
//       point of editing the row.
//   (c) deleting a course does not destroy notes: it is refused while any exist.
//
// There is a fourth case, and it is the honest half of (a): pressing "apply to
// these classes" DOES move lectures — the future, untouched ones, on Aadit's
// say-so. Even then the lecture with a note on it does not move.
//
// Real database, because the `on delete set null` foreign keys, the unique
// index on (workspace_id, position) and the cascade from `courses` are all part
// of what is being proved. Throwaway user + workspace, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'period-edits.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

// A term far enough ahead that "the rest of term" is the whole of it, whatever
// day this is run on. 2030-10-07 is a Monday; the window holds three Tuesdays
// (8, 15, 22) and three Wednesdays (9, 16, 23).
const TERM_START = '2030-10-07';
const TERM_END = '2030-10-27';
const TIME_ZONE = 'Asia/Dubai'; // UTC+4, no DST.
const TUESDAY = 2;
const WEDNESDAY = 3;

describe('editing a period never moves a lecture that already exists', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let thirdPeriodId: string;
  let sessionId: string;
  let courseId: string;
  let notedMeetingId: string;
  let noteBlockId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `period-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;
    await setTerm(db, workspaceId, { termStart: TERM_START, termEnd: TERM_END });
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to periods,
    // courses, sessions, class_meetings and blocks.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  async function meetings(): Promise<ClassMeeting[]> {
    return getMeetingsForSession(db, workspaceId, sessionId);
  }

  it('starts from the nine seeded periods, with a class and a note on one lecture', async () => {
    const periods = await getPeriods(db, workspaceId);
    expect(periods).toHaveLength(9);

    const third = periods[2];
    expect(third.label).toBe('3rd');
    expect(third.starts_at.slice(0, 5)).toBe('09:20');
    thirdPeriodId = third.id;

    const added = await addClass(db, {
      workspaceId,
      periodId: thirdPeriodId,
      weekday: TUESDAY,
      room: '257',
      newCourse: { code: 'CS301', name: 'Operating Systems', colour: 'teal', term: 'Fall 2030' },
      timeZone: TIME_ZONE,
    });
    sessionId = added.session.id;
    courseId = added.session.course_id;

    // The period's times were copied into the session, not joined to it.
    expect(added.session.starts_at.slice(0, 5)).toBe('09:20');
    expect(added.generated?.created).toBe(3);

    // 09:20 in Asia/Dubai is 05:20 UTC. The timezone is applied once, here.
    const all = await meetings();
    expect(new Date(all[0].starts_at).toISOString()).toBe('2030-10-08T05:20:00.000Z');

    const note = await createBlock(db, {
      workspaceId,
      type: 'text',
      content: { text: 'Notes from the 15 October lecture.' },
    });
    noteBlockId = note.id;
    notedMeetingId = all[1].id;
    await setMeetingNote(db, workspaceId, notedMeetingId, noteBlockId);
  });

  // (a) THE CONTROL CASE.
  it('editing the period leaves every existing lecture exactly where it was', async () => {
    const before = await meetings();
    const beforeIds = before.map((meeting) => meeting.id);
    const beforeInstants = before.map((meeting) => new Date(meeting.starts_at).toISOString());

    const edited = await updatePeriod(db, {
      workspaceId,
      periodId: thirdPeriodId,
      startsAt: '09:00',
      endsAt: '09:40',
    });
    expect(edited.starts_at.slice(0, 5)).toBe('09:00');
    expect(edited.ends_at.slice(0, 5)).toBe('09:40');

    const after = await meetings();

    // Nothing moved and nothing was rebuilt: same three rows, same three ids,
    // same three instants, in the same order.
    expect(after.map((meeting) => meeting.id)).toEqual(beforeIds);
    expect(after.map((meeting) => new Date(meeting.starts_at).toISOString())).toEqual(
      beforeInstants
    );
    expect(new Date(after[0].starts_at).toISOString()).toBe('2030-10-08T05:20:00.000Z');

    // The noted lecture keeps its id and its note. This is the assertion that
    // fails first if generation is ever changed to truncate-and-rebuild.
    const noted = after.find((meeting) => meeting.id === notedMeetingId);
    expect(noted).toBeDefined();
    expect(noted!.note_block_id).toBe(noteBlockId);
    expect(await getBlock(db, noteBlockId)).not.toBeNull();

    // And the weekly pattern itself is untouched: the period is a hint, the
    // session's own time is the truth.
    const session = await getSession(db, workspaceId, sessionId);
    expect(session!.starts_at.slice(0, 5)).toBe('09:20');

    // The screen can see that the row and its class have drifted apart.
    const usage = await getPeriodUsage(db, workspaceId);
    const third = usage.find((row) => row.periodId === thirdPeriodId);
    expect(third).toEqual({ periodId: thirdPeriodId, classes: 1, outOfStep: 1 });
  });

  // (b)
  it('a class added after the edit uses the new times', async () => {
    const added = await addClass(db, {
      workspaceId,
      periodId: thirdPeriodId,
      weekday: WEDNESDAY,
      room: '303',
      courseId,
      timeZone: TIME_ZONE,
    });

    expect(added.session.starts_at.slice(0, 5)).toBe('09:00');
    expect(added.session.ends_at.slice(0, 5)).toBe('09:40');
    expect(added.generated?.created).toBe(3);

    // 09:00 in Asia/Dubai is 05:00 UTC — the new row heading, applied once.
    const wednesdays = await getMeetingsForSession(db, workspaceId, added.session.id);
    expect(new Date(wednesdays[0].starts_at).toISOString()).toBe('2030-10-09T05:00:00.000Z');
  });

  // The honest other half of (a): the explicit, asked-for reschedule.
  it('applying the period on purpose moves the untouched lectures and only those', async () => {
    const before = await meetings();
    const notedBefore = before.find((meeting) => meeting.id === notedMeetingId)!;

    const result = await applyPeriodToClasses(db, workspaceId, thirdPeriodId, TIME_ZONE);

    // One weekly slot was behind the row — the Tuesday one. The Wednesday class
    // was added after the edit and already matched.
    expect(result.classes).toBe(1);
    expect(result.generated?.updated).toBe(2);

    const after = await meetings();
    expect(after.map((meeting) => meeting.id)).toEqual(before.map((meeting) => meeting.id));

    // The lecture with a note on it did not move, even now.
    const noted = after.find((meeting) => meeting.id === notedMeetingId)!;
    expect(new Date(noted.starts_at).toISOString()).toBe(
      new Date(notedBefore.starts_at).toISOString()
    );
    expect(noted.note_block_id).toBe(noteBlockId);

    // The two that carry nothing followed the corrected row.
    for (const meeting of after.filter((row) => row.id !== notedMeetingId)) {
      expect(new Date(meeting.starts_at).toISOString().slice(11, 16)).toBe('05:00');
    }

    expect(
      (await getPeriodUsage(db, workspaceId)).find((row) => row.periodId === thirdPeriodId)
        ?.outOfStep
    ).toBe(0);
  });

  it('adds the spare "+1" row from the printed timetable, and takes it away again', async () => {
    const extra = await addPeriod(db, {
      workspaceId,
      label: '+1',
      startsAt: '15:45',
      endsAt: '16:35',
    });
    expect(extra.position).toBe(10);
    expect(await getPeriods(db, workspaceId)).toHaveLength(10);

    const left = await removePeriod(db, workspaceId, extra.id);
    expect(left).toHaveLength(9);
    expect(left.map((period) => period.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Removing a row never touches a lecture either.
    expect(await meetings()).toHaveLength(3);
  });

  // (c)
  it('refuses to delete a course while a note hangs off one of its lectures', async () => {
    const result = await removeCourse(db, workspaceId, courseId);

    expect(result.removed).toBe(false);
    expect(result.notes).toBe(1);
    expect(result.lecturesWithWork).toBe(1);

    // The course, the lecture, the note block and the link between them are all
    // still there. `courses` cascades to `class_meetings`, so a deletion here
    // would have orphaned the note's blocks — which is losing writing.
    const { data: still } = await db
      .from('class_meetings')
      .select('id, note_block_id')
      .eq('id', notedMeetingId)
      .maybeSingle();
    expect(still).not.toBeNull();
    expect(still!.note_block_id).toBe(noteBlockId);

    const block = await getBlock(db, noteBlockId);
    expect(block).not.toBeNull();
    expect(block!.deleted_at).toBeNull();
  });

  it('deletes a course that was only ever typed in by mistake', async () => {
    const added = await addClass(db, {
      workspaceId,
      periodId: thirdPeriodId,
      weekday: TUESDAY,
      newCourse: { code: 'ZZ999', name: 'Typed by mistake', term: 'Fall 2030' },
      timeZone: TIME_ZONE,
    });

    const result = await removeCourse(db, workspaceId, added.session.course_id);
    expect(result.removed).toBe(true);

    const { data: gone } = await db
      .from('courses')
      .select('id')
      .eq('id', added.session.course_id)
      .maybeSingle();
    expect(gone).toBeNull();
  });

  it('removing a syllabus unit renumbers the ones left', async () => {
    for (const title of ['Processes', 'Scheduling', 'Memory']) {
      await createSyllabusUnit(db, { workspaceId, courseId, title });
    }
    const units = await getSyllabusUnits(db, courseId);
    expect(units.map((unit) => unit.position)).toEqual([1, 2, 3]);

    const left = await removeSyllabusUnit(db, workspaceId, units[1].id);
    expect(left.map((unit) => unit.title)).toEqual(['Processes', 'Memory']);
    expect(left.map((unit) => unit.position)).toEqual([1, 2]);
  });
});
