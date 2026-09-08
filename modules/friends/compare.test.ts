import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createCourse, createSession } from '@/modules/courses';
import {
  acceptRequest,
  getFriendWeek,
  getFriends,
  removeFriendship,
  sendRequest,
  setShareLevel,
} from '@/modules/friends';
import { claimUsername } from '@/modules/profiles';
import { ensureWorkspace } from '@/modules/workspaces';

// THE test for slice 23.
//
// This is the function that hands one person another person's week. Three ways
// it can be wrong, and only the first is obvious:
//
//   1. It shows a timetable to somebody who is not a friend. Loud, and the
//      easiest of the three to remember to test.
//
//   2. **It reads the wrong direction.** `friendships` holds two independent
//      decisions on one row. What Bob is allowed to see is what ALICE shares,
//      which is `requester_shares` when she is the requester and
//      `addressee_shares` when she is not. Read the wrong one and Bob sees
//      Alice's week on the strength of a choice *he* made about his own — and
//      nothing about the screen looks wrong. This is the property the whole
//      slice turns on, and it is asserted below in both directions, with the two
//      sides deliberately set to different levels so that a mix-up cannot pass.
//
//   3. It leaks the course code at `busy`. The level is meant to say *when*
//      somebody is in a class and nothing about which.
//
// Every assertion runs as a real signed-in user on the anon key. The
// service-role key bypasses RLS and would make `friend_timetable` answer for
// anybody, which is exactly the bug being tested for.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'compare.test.ts needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'and SUPABASE_SERVICE_ROLE_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

const TUESDAY = 2;
const THURSDAY = 4;

describe('a friend sees exactly what you chose to show them, and nobody else sees anything', () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let carol: SupabaseClient;

  let aliceId: string;
  let bobId: string;
  let carolId: string;
  let aliceName: string;
  let bobName: string;

  const password = `pw-${randomUUID()}`;
  const made: string[] = [];

  async function signedInUser(
    prefix: string
  ): Promise<{ id: string; db: SupabaseClient; username: string }> {
    const email = `compare-${prefix}-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    made.push(data.user.id);

    const db = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await db.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`could not sign in test user: ${signInError.message}`);

    const username = `${prefix}${randomUUID().replace(/[^a-f0-9]/g, '').slice(0, 10)}`;
    await claimUsername(db, { userId: data.user.id, username });

    return { id: data.user.id, db, username };
  }

  /** A course with one weekly class in it, written as that person. */
  async function giveClass(
    db: SupabaseClient,
    userId: string,
    code: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string
  ): Promise<void> {
    const workspace = await ensureWorkspace(db, userId);
    const course = await createCourse(db, {
      workspaceId: workspace.id,
      code,
      name: `${code} the subject`,
      term: 'This term',
      colour: null,
    });
    await createSession(db, {
      workspaceId: workspace.id,
      courseId: course.id,
      weekday,
      startsAt,
      endsAt,
      room,
      isLab: false,
    });
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const a = await signedInUser('alice');
    const b = await signedInUser('bob');
    const c = await signedInUser('carol');

    alice = a.db;
    bob = b.db;
    carol = c.db;
    aliceId = a.id;
    bobId = b.id;
    carolId = c.id;
    aliceName = a.username;
    bobName = b.username;

    // Alice has one class; Bob has a different one at a different time, so a
    // mix-up between the two shows up as the wrong *code*, not just as a count.
    await giveClass(alice, aliceId, 'MA201', TUESDAY, '07:30', '08:20', 'B-14');
    await giveClass(bob, bobId, 'PH101', THURSDAY, '09:10', '10:00', 'Lab 2');

    // And they become friends: Alice asks, Bob accepts. Alice is the requester,
    // which is what makes the direction test below mean anything.
    await sendRequest(alice, aliceId, bobName);
    const request = (await getFriends(bob)).incoming[0];
    await acceptRequest(bob, request.id);
  });

  afterAll(async () => {
    for (const id of made) {
      if (admin && id) await admin.auth.admin.deleteUser(id);
    }
  });

  // =========================================================================
  // THE INVARIANT — the direction
  // =========================================================================

  it('reads what THEY share, not what I share — with the two set differently', async () => {
    // Alice (the requester) shows nothing. Bob (the addressee) shows everything.
    // If the function reads the caller's own column instead of the other side's,
    // these two assertions swap, and both of them fail.
    await setShareLevel(alice, aliceId, (await getFriends(alice)).friends[0].id, 'none');
    await setShareLevel(bob, bobId, (await getFriends(bob)).friends[0].id, 'full');

    // Bob looking at Alice: she shows nothing, so he gets nothing — even though
    // he himself shares everything.
    const aliceAsBobSeesHer = await getFriendWeek(bob, aliceName);
    expect(aliceAsBobSeesHer).not.toBeNull();
    expect(aliceAsBobSeesHer!.friendship.they_share).toBe('none');
    expect(aliceAsBobSeesHer!.classes).toEqual([]);

    // Alice looking at Bob: he shows everything, so she gets it — even though
    // she herself shares nothing.
    const bobAsAliceSeesHim = await getFriendWeek(alice, bobName);
    expect(bobAsAliceSeesHim).not.toBeNull();
    expect(bobAsAliceSeesHim!.friendship.they_share).toBe('full');
    expect(bobAsAliceSeesHim!.classes).toHaveLength(1);
    expect(bobAsAliceSeesHim!.classes[0].course_code).toBe('PH101');
  });

  it('reads the right column whichever side of the row you are on', async () => {
    // The mirror of the above: now Alice shows full and Bob shows none. The two
    // people have not changed sides, so this catches a function that reads
    // `requester_shares` unconditionally as well as one that reads the caller's.
    await setShareLevel(alice, aliceId, (await getFriends(alice)).friends[0].id, 'full');
    await setShareLevel(bob, bobId, (await getFriends(bob)).friends[0].id, 'none');

    const aliceAsBobSeesHer = await getFriendWeek(bob, aliceName);
    expect(aliceAsBobSeesHer!.classes).toHaveLength(1);
    expect(aliceAsBobSeesHer!.classes[0].course_code).toBe('MA201');

    const bobAsAliceSeesHim = await getFriendWeek(alice, bobName);
    expect(bobAsAliceSeesHim!.classes).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // The levels
  // -------------------------------------------------------------------------

  it('shows the times but NOT the course or the room at "busy"', async () => {
    await setShareLevel(alice, aliceId, (await getFriends(alice)).friends[0].id, 'busy');

    const week = await getFriendWeek(bob, aliceName);
    expect(week!.classes).toHaveLength(1);

    const only = week!.classes[0];
    // When she is busy: yes.
    expect(only.weekday).toBe(TUESDAY);
    expect(only.starts_at.slice(0, 5)).toBe('07:30');
    expect(only.ends_at.slice(0, 5)).toBe('08:20');
    // What she is doing: no. Null rather than absent, so the shape of the row
    // gives nothing away either.
    expect(only.course_code).toBeNull();
    expect(only.room).toBeNull();
  });

  it('shows the course and the room at "full"', async () => {
    await setShareLevel(alice, aliceId, (await getFriends(alice)).friends[0].id, 'full');

    const only = (await getFriendWeek(bob, aliceName))!.classes[0];
    expect(only.course_code).toBe('MA201');
    expect(only.room).toBe('B-14');
  });

  it('returns the same shape at every level, so the level cannot be read off the row', async () => {
    await setShareLevel(alice, aliceId, (await getFriends(alice)).friends[0].id, 'busy');
    const busy = (await getFriendWeek(bob, aliceName))!.classes[0];

    await setShareLevel(alice, aliceId, (await getFriends(alice)).friends[0].id, 'full');
    const full = (await getFriendWeek(bob, aliceName))!.classes[0];

    expect(Object.keys(busy).sort()).toEqual(Object.keys(full).sort());
  });

  // -------------------------------------------------------------------------
  // Everyone else
  // -------------------------------------------------------------------------

  it('shows a stranger nothing, through the function or straight at it', async () => {
    // Carol is signed in and is nobody's friend.
    expect(await getFriendWeek(carol, aliceName)).toBeNull();

    // And calling the function directly with Alice's id, which is the shape an
    // attacker would use: the friendship check is inside the function, not in
    // the TypeScript above it.
    const { data } = await carol.rpc('friend_timetable', { p_friend_id: aliceId });
    expect(data).toEqual([]);
  });

  it('shows nothing while a request is still pending', async () => {
    // A request is not consent. Carol asks Alice and does not wait to be let in.
    await sendRequest(carol, carolId, aliceName);

    expect(await getFriendWeek(carol, aliceName)).toBeNull();
    const { data } = await carol.rpc('friend_timetable', { p_friend_id: aliceId });
    expect(data).toEqual([]);
  });

  it('stops showing anything the moment the friendship is deleted', async () => {
    // The check is a join against `friendships`, so removing the row is the
    // whole of revoking access — there is no second place that has to be told.
    const id = (await getFriends(bob)).friends[0].id;
    await removeFriendship(bob, id);

    expect(await getFriendWeek(bob, aliceName)).toBeNull();
    const { data } = await bob.rpc('friend_timetable', { p_friend_id: aliceId });
    expect(data).toEqual([]);
  });

  it('never lets `sessions` be read directly — the policy was not widened', async () => {
    // The policy on `sessions` was deliberately left alone: it reaches a
    // workspace only through `courses`, so widening it to friendships would make
    // it four tables deep and a direction-dependent column read, running on
    // every query anyone ever writes against it.
    //
    // Bob reads `sessions` and gets his own class and only his own. He and Alice
    // were friends a moment ago and she was sharing `full`; even then, the only
    // door to her week was `friend_timetable`.
    const { data } = await bob.from('sessions').select('*');

    expect(data).toHaveLength(1);
    expect(data![0].room).toBe('Lab 2');
    // Alice's room, which he could see through the function while she shared
    // `full`, was never readable here.
    expect(data!.every((row) => row.room !== 'B-14')).toBe(true);
  });
});
