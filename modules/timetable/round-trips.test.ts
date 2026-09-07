import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { addClass, getPeriods } from '@/modules/timetable';
import { ensureWorkspace, setTerm, type Workspace } from '@/modules/workspaces';

// The other half of slice 19, and the half that has a number on it.
//
// docs/HANDOFF.md, measured rather than guessed: this project's database is in
// ap-southeast-2 and one round trip costs ~606ms, of which essentially none is
// query time — `select id limit 1` on an empty table costs the same. So the
// latency of adding a class is not "how much work is done", it is "how many
// times the code stops and waits", and the only way to keep that honest is to
// count.
//
// Optimistic UI hides this from the eye. It does not remove it: the save is
// still not finished, /calendar and /today are still not correct, and a slow
// enough save is still a save that can fail after the block was drawn. So both
// halves of the slice are needed, and this is the one that can regress silently
// — nobody notices a round trip coming back when the screen already looks fast.
//
// A `.from()` call is one HTTP request to PostgREST. Counting them by proxying
// the client counts real queries against the real database, not a model of it.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'round-trips.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

const TERM_START = '2030-10-07';
const TERM_END = '2030-10-27';
const TIME_ZONE = 'Asia/Dubai';
const TUESDAY = 2;

/** A client that records every table it touches, and touches them for real. */
function counting(db: SupabaseClient): { db: SupabaseClient; tables: string[] } {
  const tables: string[] = [];
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          tables.push(table);
          return target.from(table);
        };
      }
      if (prop === 'rpc') {
        return (fn: string, args?: unknown) => {
          tables.push(`rpc:${fn}`);
          return (target.rpc as (a: string, b?: unknown) => unknown)(fn, args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db: proxy as SupabaseClient, tables };
}

describe('adding a class does not stop and wait more often than it must', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspace: Workspace;
  let periodIds: string[];

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `round-trips-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspace = await ensureWorkspace(db, userId);
    workspace = await setTerm(db, workspace.id, {
      termStart: TERM_START,
      termEnd: TERM_END,
    });
    periodIds = (await getPeriods(db, workspace.id)).map((period) => period.id);
  });

  afterAll(async () => {
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('adds the first class, and its course, in eight queries', async () => {
    const { db: counted, tables } = counting(db);

    await addClass(
      counted,
      {
        workspaceId: workspace.id,
        periodId: periodIds[0],
        weekday: TUESDAY,
        room: 'B-14',
        isLab: false,
        newCourse: { code: 'MA201', name: 'Linear Algebra', colour: 'indigo' },
        timeZone: TIME_ZONE,
      },
      // The workspace the server action already read. Passing it is what stops
      // `generateRestOfTerm` fetching the same row by the same id a second time.
      workspace
    );

    // Named rather than counted, so a regression says *what* came back.
    expect(tables).toEqual([
      'periods', //        which row of the grid was clicked
      'courses', //        does this workspace already have a course (for the term)
      'courses', //        insert the new one
      'courses', //        the ownership check inside createSession
      'sessions', //       insert the weekly slot
      'sessions', //       every slot in the workspace, joined to courses — ONE query
      'class_meetings', // what already exists in the window
      'class_meetings', // insert the rest of term
    ]);

    // `workspaces` must not appear. It is the row the caller already handed in.
    expect(tables).not.toContain('workspaces');
  });

  it('adds a second class to an existing course in six queries', async () => {
    const { db: counted, tables } = counting(db);
    const courseId = (
      await db.from('courses').select('id').eq('workspace_id', workspace.id).single()
    ).data!.id as string;

    await addClass(
      counted,
      {
        workspaceId: workspace.id,
        periodId: periodIds[1],
        weekday: TUESDAY,
        room: 'B-14',
        isLab: false,
        courseId,
        timeZone: TIME_ZONE,
      },
      workspace
    );

    expect(tables).toEqual([
      'periods',
      'courses', //        the ownership check inside createSession
      'sessions', //       insert
      'sessions', //       the joined read that replaced listCourses + listSessions
      'class_meetings',
      'class_meetings',
    ]);
    expect(tables).not.toContain('workspaces');
  });

  it('reads the workspace itself when the caller has not already got it', async () => {
    // The old path still works — `generateRestOfTerm` falls back to fetching.
    // This is here so the optimisation stays an optimisation rather than turning
    // into a requirement that a future caller can forget and silently break.
    const { db: counted, tables } = counting(db);

    await addClass(counted, {
      workspaceId: workspace.id,
      periodId: periodIds[2],
      weekday: TUESDAY,
      room: 'B-14',
      isLab: false,
      courseId: (
        await db.from('courses').select('id').eq('workspace_id', workspace.id).single()
      ).data!.id as string,
      timeZone: TIME_ZONE,
    });

    expect(tables).toContain('workspaces');
    expect(tables.filter((table) => table === 'sessions')).toHaveLength(2);
  });
});
