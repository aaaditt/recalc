import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  getMinutesOnDate,
  getMinutesPerCourseBetween,
  getMinutesThisWeek,
  getStudySession,
  getUnitStudy,
  logStudySession,
  setFocusRating,
} from '@/modules/study';
import { ensureWorkspace } from '@/modules/workspaces';

// THE invariant of slice 07:
//
//   a finished focus block turns into minutes against the course and the
//   syllabus unit that were picked before it started — counted once, and only
//   ever for ids the caller actually owns.
//
// prompts/07-focus.md: "The timer is trivial. The log is the point." Slice 12
// crosses these minutes with unanswered questions per unit to produce the
// sentence docs/PRODUCT.md says the product exists for. If the minutes can land
// on the wrong unit, be counted twice, or be written against someone else's
// course, that sentence is a lie and nothing downstream of it can be trusted.
//
// Three things are proved here:
//   1. the minutes land where they were pointed (course, unit, and day),
//   2. the same block logged twice is still one block,
//   3. a courseId or unitId from another workspace is refused outright.
//
// Real database, because the unique index, the foreign keys and the cascade are
// part of what is being proven. Throwaway users + workspaces, deleted after.
//
// The service-role client bypasses RLS, so (3) would pass on a database with no
// policies at all — which is exactly why the ownership check lives in
// modules/study's `checkLinks` and is asserted here rather than assumed of RLS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'study-sessions.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

const TIME_ZONE = 'Asia/Dubai';
// 2026-08-24 is a Monday, so "this week" starts on it (lib/calendar's
// WEEK_STARTS_ON) and the day total and the week total are the same number.
const MONDAY = '2026-08-24';
const SUNDAY = '2026-08-23';

/** Every instant below is +04, so 06:00Z is mid-morning on the local day. */
const AT = {
  mondayMorning: '2026-08-24T06:00:00.000Z',
  mondayMidday: '2026-08-24T08:00:00.000Z',
  mondayAfternoon: '2026-08-24T10:00:00.000Z',
  sundayMorning: '2026-08-23T06:00:00.000Z',
};

/** `startedAt` plus `minutes`, as an ISO instant. */
function after(startedAt: string, minutes: number): string {
  return new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString();
}

/** A signed-up user with a workspace, one course and two syllabus units. */
async function makeWorkspace(db: SupabaseClient, label: string) {
  const { data, error } = await db.auth.admin.createUser({
    email: `${label}-${randomUUID()}@example.com`,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create test user: ${error.message}`);
  const userId = data.user.id;

  const workspaceId = (await ensureWorkspace(db, userId)).id;

  const { data: course, error: cErr } = await db
    .from('courses')
    .insert({
      workspace_id: workspaceId,
      code: 'ME301',
      name: 'Thermodynamics II',
      term: 'Fall 2026',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`could not create course: ${cErr.message}`);

  const { data: units, error: uErr } = await db
    .from('syllabus_units')
    .insert([
      { course_id: course.id, position: 1, title: 'Unit 1 — Entropy' },
      { course_id: course.id, position: 2, title: 'Unit 2 — Cycles' },
    ])
    .select('id, position')
    .order('position', { ascending: true });
  if (uErr) throw new Error(`could not create units: ${uErr.message}`);

  return {
    userId,
    workspaceId,
    courseId: course.id as string,
    unitOne: units[0].id as string,
    unitTwo: units[1].id as string,
  };
}

// ---------------------------------------------------------------------------

describe('a focus block becomes minutes against the unit it was started on', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let courseId: string;
  let unitOne: string;
  let unitTwo: string;
  /** A second course in the same workspace, so per-course totals can be split. */
  let otherCourseId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const made = await makeWorkspace(db, 'study-minutes');
    userId = made.userId;
    workspaceId = made.workspaceId;
    courseId = made.courseId;
    unitOne = made.unitOne;
    unitTwo = made.unitTwo;

    const { data: other, error } = await db
      .from('courses')
      .insert({
        workspace_id: workspaceId,
        code: 'MA202',
        name: 'Linear Algebra',
        term: 'Fall 2026',
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not create second course: ${error.message}`);
    otherCourseId = other.id as string;
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to the
    // courses, the units and every study_sessions row hanging off them.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('records the course, the unit and the two instants it was given', async () => {
    const session = await logStudySession(db, {
      workspaceId,
      courseId,
      unitId: unitOne,
      startedAt: AT.mondayMorning,
      endedAt: after(AT.mondayMorning, 25),
    });

    expect(session.course_id).toBe(courseId);
    expect(session.unit_id).toBe(unitOne);
    expect(session.focus_rating).toBeNull();
    expect(new Date(session.started_at).toISOString()).toBe(AT.mondayMorning);
  });

  it('counts those 25 minutes on that local day, and on that unit', async () => {
    expect(await getMinutesOnDate(db, workspaceId, MONDAY, TIME_ZONE)).toBe(25);

    const perCourse = await getMinutesPerCourseBetween(
      db,
      workspaceId,
      MONDAY,
      MONDAY,
      TIME_ZONE
    );
    expect(perCourse).toEqual([{ courseId, minutes: 25 }]);

    const perUnit = await getUnitStudy(db, workspaceId, TIME_ZONE);
    expect(perUnit).toHaveLength(1);
    expect(perUnit[0].unitId).toBe(unitOne);
    expect(perUnit[0].courseId).toBe(courseId);
    expect(perUnit[0].minutes).toBe(25);
    expect(perUnit[0].lastStudiedOn).toBe(MONDAY);
  });

  it('logging the same block twice does not log the minutes twice', async () => {
    // A second tab, a double tap, a request the browser retried. Same
    // (workspace, started_at) as the block written in the first test.
    const again = await logStudySession(db, {
      workspaceId,
      courseId,
      unitId: unitOne,
      startedAt: AT.mondayMorning,
      endedAt: after(AT.mondayMorning, 25),
    });

    const stored = await getStudySession(db, workspaceId, again.id);
    expect(stored).not.toBeNull();
    expect(stored?.started_at).toBe(again.started_at);

    expect(await getMinutesOnDate(db, workspaceId, MONDAY, TIME_ZONE)).toBe(25);
    expect((await getUnitStudy(db, workspaceId, TIME_ZONE))[0].minutes).toBe(25);
  });

  it('a block with no unit counts for its course and for no unit at all', async () => {
    await logStudySession(db, {
      workspaceId,
      courseId: otherCourseId,
      unitId: null,
      startedAt: AT.mondayMidday,
      endedAt: after(AT.mondayMidday, 25),
    });

    expect(await getMinutesOnDate(db, workspaceId, MONDAY, TIME_ZONE)).toBe(50);

    const perCourse = await getMinutesPerCourseBetween(
      db,
      workspaceId,
      MONDAY,
      MONDAY,
      TIME_ZONE
    );
    expect(perCourse).toEqual([
      { courseId, minutes: 25 },
      { courseId: otherCourseId, minutes: 25 },
    ]);

    // Still one unit with minutes on it, and it is not this course's.
    const perUnit = await getUnitStudy(db, workspaceId, TIME_ZONE);
    expect(perUnit.map((entry) => entry.unitId)).toEqual([unitOne]);
  });

  it('splits minutes between two units of the same course, most studied first', async () => {
    await logStudySession(db, {
      workspaceId,
      courseId,
      unitId: unitTwo,
      startedAt: AT.mondayAfternoon,
      endedAt: after(AT.mondayAfternoon, 10),
    });

    const perUnit = await getUnitStudy(db, workspaceId, TIME_ZONE);
    expect(perUnit.map((entry) => [entry.unitId, entry.minutes])).toEqual([
      [unitOne, 25],
      [unitTwo, 10],
    ]);

    expect(await getMinutesOnDate(db, workspaceId, MONDAY, TIME_ZONE)).toBe(60);
  });

  it('the week starts on Monday: Sunday night is last week', async () => {
    await logStudySession(db, {
      workspaceId,
      courseId,
      unitId: unitOne,
      startedAt: AT.sundayMorning,
      endedAt: after(AT.sundayMorning, 25),
    });

    // Its own day has it...
    expect(await getMinutesOnDate(db, workspaceId, SUNDAY, TIME_ZONE)).toBe(25);
    // ...Monday still does not...
    expect(await getMinutesOnDate(db, workspaceId, MONDAY, TIME_ZONE)).toBe(60);
    // ...and the week that starts on that Monday does not either.
    expect(await getMinutesThisWeek(db, workspaceId, TIME_ZONE, MONDAY)).toBe(60);

    // The unit total is across all time, so it does hold both.
    expect((await getUnitStudy(db, workspaceId, TIME_ZONE))[0].minutes).toBe(50);
  });

  it('answers the one optional question, and can un-answer it', async () => {
    const session = await logStudySession(db, {
      workspaceId,
      courseId,
      unitId: unitOne,
      startedAt: '2026-08-24T12:00:00.000Z',
      endedAt: '2026-08-24T12:25:00.000Z',
    });

    expect((await setFocusRating(db, workspaceId, session.id, 3)).focus_rating).toBe(3);
    expect((await setFocusRating(db, workspaceId, session.id, null)).focus_rating).toBeNull();
  });

  it('refuses a block that is too short or longer than a pomodoro', async () => {
    await expect(
      logStudySession(db, {
        workspaceId,
        courseId,
        unitId: unitOne,
        startedAt: '2026-08-25T06:00:00.000Z',
        endedAt: '2026-08-25T06:00:30.000Z',
      })
    ).rejects.toThrow(/shorter than a minute/);

    await expect(
      logStudySession(db, {
        workspaceId,
        courseId,
        unitId: unitOne,
        startedAt: '2026-08-25T07:00:00.000Z',
        endedAt: '2026-08-25T09:00:00.000Z',
      })
    ).rejects.toThrow(/cannot be longer than/);

    expect(await getMinutesOnDate(db, workspaceId, '2026-08-25', TIME_ZONE)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('a client-supplied id must belong to the caller', () => {
  let db: SupabaseClient;
  let mine: Awaited<ReturnType<typeof makeWorkspace>>;
  let theirs: Awaited<ReturnType<typeof makeWorkspace>>;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mine = await makeWorkspace(db, 'study-mine');
    theirs = await makeWorkspace(db, 'study-theirs');
  });

  afterAll(async () => {
    if (db && mine?.userId) await db.auth.admin.deleteUser(mine.userId);
    if (db && theirs?.userId) await db.auth.admin.deleteUser(theirs.userId);
  });

  it('refuses a courseId from another workspace', async () => {
    await expect(
      logStudySession(db, {
        workspaceId: mine.workspaceId,
        courseId: theirs.courseId,
        unitId: null,
        startedAt: AT.mondayMorning,
        endedAt: after(AT.mondayMorning, 25),
      })
    ).rejects.toThrow(/no course/);
  });

  it('refuses a unitId belonging to another workspace', async () => {
    await expect(
      logStudySession(db, {
        workspaceId: mine.workspaceId,
        courseId: mine.courseId,
        unitId: theirs.unitOne,
        startedAt: AT.mondayMidday,
        endedAt: after(AT.mondayMidday, 25),
      })
    ).rejects.toThrow(/different course/);
  });

  it('refuses a course and unit that are both theirs', async () => {
    await expect(
      logStudySession(db, {
        workspaceId: mine.workspaceId,
        courseId: theirs.courseId,
        unitId: theirs.unitOne,
        startedAt: AT.mondayAfternoon,
        endedAt: after(AT.mondayAfternoon, 25),
      })
    ).rejects.toThrow(/no course/);
  });

  it('wrote nothing at all while refusing — neither workspace gained a minute', async () => {
    expect(await getMinutesOnDate(db, mine.workspaceId, MONDAY, TIME_ZONE)).toBe(0);
    expect(await getMinutesOnDate(db, theirs.workspaceId, MONDAY, TIME_ZONE)).toBe(0);
    expect(await getUnitStudy(db, mine.workspaceId, TIME_ZONE)).toEqual([]);
    expect(await getUnitStudy(db, theirs.workspaceId, TIME_ZONE)).toEqual([]);
  });

  it('refuses to read or rate another workspace\'s session', async () => {
    const theirSession = await logStudySession(db, {
      workspaceId: theirs.workspaceId,
      courseId: theirs.courseId,
      unitId: theirs.unitOne,
      startedAt: AT.mondayMorning,
      endedAt: after(AT.mondayMorning, 25),
    });

    expect(await getStudySession(db, mine.workspaceId, theirSession.id)).toBeNull();
    await expect(
      setFocusRating(db, mine.workspaceId, theirSession.id, 3)
    ).rejects.toThrow(/no study session/);

    // Still theirs, still unrated.
    const untouched = await getStudySession(db, theirs.workspaceId, theirSession.id);
    expect(untouched?.focus_rating).toBeNull();
  });
});
