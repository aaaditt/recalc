import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  createSyllabusUnit,
  getSyllabusUnits,
  moveSyllabusUnit,
  renameSyllabusUnit,
  reorderSyllabusUnits,
  setSyllabusUnitStatus,
} from '@/modules/courses';
import { ensureWorkspace } from '@/modules/workspaces';

// THE invariant of slice 08:
//
//   reordering a syllabus never loses a unit and never leaves two units
//   claiming the same place — and no write ever touches a unit belonging to
//   someone else's course.
//
// The syllabus is the spine everything else in the product hangs off: minutes
// (slice 07) and questions (slice 12) are counted *per unit*, and the sentence
// docs/PRODUCT.md says the app exists to say — "6 questions on Unit 3, 20
// minutes on Unit 3" — is a claim about a numbered position in an ordered list.
// If a reorder can duplicate a position, "Unit 3" stops meaning one thing. If a
// reorder can drop a unit, the minutes logged against it are orphaned.
//
// Real database, because the foreign keys and the RLS-shaped ownership chain
// (syllabus_units has no workspace_id — ownership flows through course_id) are
// part of what is being proved. Throwaway users + workspaces, deleted after.
//
// The service-role client bypasses RLS, so every refusal asserted below would
// pass on a database with no policies at all — which is exactly why the checks
// live in modules/courses and are asserted here rather than assumed of RLS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'syllabus-units.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

/** A signed-up user with a workspace and one course. No units yet. */
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

  return { userId, workspaceId, courseId: course.id as string };
}

/** Positions must always be 1..n, in list order, with no repeats. */
function expectWellOrdered(
  units: readonly { id: string; position: number }[],
  expectedIds: readonly string[]
) {
  expect(units.map((unit) => unit.id)).toEqual(expectedIds);
  expect(units.map((unit) => unit.position)).toEqual(
    expectedIds.map((_id, index) => index + 1)
  );
  expect(new Set(units.map((unit) => unit.position)).size).toBe(units.length);
}

// ---------------------------------------------------------------------------

describe('typing a syllabus in, and putting it in the right order', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let courseId: string;
  let ids: string[] = [];

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const made = await makeWorkspace(db, 'syllabus-order');
    userId = made.userId;
    workspaceId = made.workspaceId;
    courseId = made.courseId;
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, the course and every
    // syllabus unit hanging off it.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('appends each unit to the end, numbered 1..n', async () => {
    for (const title of ['Entropy', 'Enthalpy', 'Cycles', 'Heat transfer']) {
      const unit = await createSyllabusUnit(db, { workspaceId, courseId, title });
      ids.push(unit.id);
    }

    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
  });

  it('trims the title, and refuses an empty one', async () => {
    const unit = await createSyllabusUnit(db, {
      workspaceId,
      courseId,
      title: '  Combustion  ',
    });
    expect(unit.title).toBe('Combustion');
    ids.push(unit.id);

    await expect(
      createSyllabusUnit(db, { workspaceId, courseId, title: '   ' })
    ).rejects.toThrow(/needs a title/);

    expect(await getSyllabusUnits(db, courseId)).toHaveLength(5);
  });

  it('moving a unit up swaps it with the one above and renumbers 1..n', async () => {
    // [Entropy, Enthalpy, Cycles, Heat transfer, Combustion]
    await moveSyllabusUnit(db, workspaceId, ids[2], 'up');

    const wanted = [ids[0], ids[2], ids[1], ids[3], ids[4]];
    expectWellOrdered(await getSyllabusUnits(db, courseId), wanted);
    ids = wanted;
  });

  it('moving a unit down does the same the other way', async () => {
    await moveSyllabusUnit(db, workspaceId, ids[0], 'down');

    const wanted = [ids[1], ids[0], ids[2], ids[3], ids[4]];
    expectWellOrdered(await getSyllabusUnits(db, courseId), wanted);
    ids = wanted;
  });

  it('moving the first unit up, or the last down, changes nothing', async () => {
    await moveSyllabusUnit(db, workspaceId, ids[0], 'up');
    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);

    await moveSyllabusUnit(db, workspaceId, ids[4], 'down');
    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
  });

  it('a run of moves never loses a unit and never repeats a position', async () => {
    // The invariant, hammered. Every intermediate state is checked, not just
    // the last one, because a duplicate position that heals on the next move
    // is still a moment where "Unit 3" meant two things.
    //
    // A fixed script rather than random moves: a test that only sometimes
    // exercises the interesting case is a test that only sometimes catches the
    // bug. These six walk one unit from the bottom to the top and back down
    // past a different neighbour each time. Five units, indices 0..4.
    const script = [
      { at: 4, direction: 'up' as const },
      { at: 3, direction: 'up' as const },
      { at: 2, direction: 'up' as const },
      { at: 1, direction: 'up' as const },
      { at: 0, direction: 'down' as const },
      { at: 3, direction: 'down' as const },
    ];

    for (const { at, direction } of script) {
      await moveSyllabusUnit(db, workspaceId, ids[at], direction);

      const to = direction === 'up' ? at - 1 : at + 1;
      if (to >= 0 && to < ids.length) {
        [ids[at], ids[to]] = [ids[to], ids[at]];
      }

      expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
    }
  });

  it('a unit added after a reorder still lands at the end', async () => {
    const added = await createSyllabusUnit(db, {
      workspaceId,
      courseId,
      title: 'Refrigeration',
    });
    ids.push(added.id);

    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
  });

  it('reorders the whole list in one go', async () => {
    const reversed = [...ids].reverse();
    expectWellOrdered(
      await reorderSyllabusUnits(db, workspaceId, courseId, reversed),
      reversed
    );
    ids = reversed;
  });

  it('refuses an order that would lose a unit, and writes nothing', async () => {
    await expect(
      reorderSyllabusUnits(db, workspaceId, courseId, ids.slice(1))
    ).rejects.toThrow(/expected all/);

    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
  });

  it('refuses an order that names a unit twice, and writes nothing', async () => {
    await expect(
      reorderSyllabusUnits(db, workspaceId, courseId, [ids[0], ...ids])
    ).rejects.toThrow(/listed twice/);

    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
  });

  it('renames a unit without moving it', async () => {
    const renamed = await renameSyllabusUnit(db, workspaceId, ids[1], '  Entropy II  ');
    expect(renamed.title).toBe('Entropy II');

    expectWellOrdered(await getSyllabusUnits(db, courseId), ids);
  });

  it('sets a status, and refuses one that is not on the list', async () => {
    const marked = await setSyllabusUnitStatus(db, workspaceId, ids[0], 'comfortable');
    expect(marked.status).toBe('comfortable');
    expect(marked.position).toBe(1);

    await expect(
      // A status a form could only produce by being tampered with.
      setSyllabusUnitStatus(
        db,
        workspaceId,
        ids[0],
        'nearly' as unknown as 'comfortable'
      )
    ).rejects.toThrow();

    const units = await getSyllabusUnits(db, courseId);
    expect(units[0].status).toBe('comfortable');
  });
});

// ---------------------------------------------------------------------------

describe('a client-supplied id must belong to the caller', () => {
  let db: SupabaseClient;
  let mine: Awaited<ReturnType<typeof makeWorkspace>>;
  let theirs: Awaited<ReturnType<typeof makeWorkspace>>;
  let theirUnitA: string;
  let theirUnitB: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mine = await makeWorkspace(db, 'syllabus-mine');
    theirs = await makeWorkspace(db, 'syllabus-theirs');

    theirUnitA = (
      await createSyllabusUnit(db, {
        workspaceId: theirs.workspaceId,
        courseId: theirs.courseId,
        title: 'Their Unit 1',
      })
    ).id;
    theirUnitB = (
      await createSyllabusUnit(db, {
        workspaceId: theirs.workspaceId,
        courseId: theirs.courseId,
        title: 'Their Unit 2',
      })
    ).id;
  });

  afterAll(async () => {
    if (db && mine?.userId) await db.auth.admin.deleteUser(mine.userId);
    if (db && theirs?.userId) await db.auth.admin.deleteUser(theirs.userId);
  });

  it('refuses to add a unit to another workspace\'s course', async () => {
    await expect(
      createSyllabusUnit(db, {
        workspaceId: mine.workspaceId,
        courseId: theirs.courseId,
        title: 'Smuggled in',
      })
    ).rejects.toThrow(/no course/);
  });

  it('refuses to rename another workspace\'s unit', async () => {
    await expect(
      renameSyllabusUnit(db, mine.workspaceId, theirUnitA, 'Mine now')
    ).rejects.toThrow(/no course/);
  });

  it('refuses to set the status of another workspace\'s unit', async () => {
    await expect(
      setSyllabusUnitStatus(db, mine.workspaceId, theirUnitA, 'mastered')
    ).rejects.toThrow(/no course/);
  });

  it('refuses to move another workspace\'s unit', async () => {
    await expect(
      moveSyllabusUnit(db, mine.workspaceId, theirUnitB, 'up')
    ).rejects.toThrow(/no course/);
  });

  it('refuses to reorder another workspace\'s course', async () => {
    await expect(
      reorderSyllabusUnits(db, mine.workspaceId, theirs.courseId, [theirUnitB, theirUnitA])
    ).rejects.toThrow(/no course/);
  });

  it('refuses a foreign unit id inside an order for my own course', async () => {
    const mineUnit = await createSyllabusUnit(db, {
      workspaceId: mine.workspaceId,
      courseId: mine.courseId,
      title: 'My Unit 1',
    });

    await expect(
      reorderSyllabusUnits(db, mine.workspaceId, mine.courseId, [theirUnitA, mineUnit.id])
    ).rejects.toThrow(/is not on this course/);
  });

  it('wrote nothing at all while refusing — their syllabus is untouched', async () => {
    const theirUnits = await getSyllabusUnits(db, theirs.courseId);
    expectWellOrdered(theirUnits, [theirUnitA, theirUnitB]);
    expect(theirUnits.map((unit) => unit.title)).toEqual(['Their Unit 1', 'Their Unit 2']);
    expect(theirUnits.every((unit) => unit.status === 'not_started')).toBe(true);

    // And my own course gained exactly the one unit I added myself.
    expect(await getSyllabusUnits(db, mine.courseId)).toHaveLength(1);
  });
});
