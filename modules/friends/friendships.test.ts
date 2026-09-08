import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  AlreadyAsked,
  AlreadyFriends,
  NoSuchUser,
  TheyAskedYou,
  acceptRequest,
  getFriends,
  removeFriendship,
  sendRequest,
  setShareLevel,
} from '@/modules/friends';
import { claimUsername } from '@/modules/profiles';

// THE test for slice 22.
//
// This is the first table in the project that lets one person see another
// person's data. Everything before it was "is this row in a workspace you own",
// and getting that wrong showed you your own data twice. Getting *this* wrong
// shows somebody else's week to somebody they did not agree to show it to.
//
// So every assertion below runs as a real signed-in user on the anon key. The
// service-role key bypasses RLS entirely, and a policy test written with it
// passes whether the policy exists or not — it proves nothing. The admin client
// here only ever makes and destroys the three accounts.
//
// The properties, in the order they matter:
//
//   1. Each side owns exactly one visibility column. Carol cannot make Alice
//      share more, and Alice cannot make Carol share more. This is the privacy
//      boundary of the slice and it is enforced by a trigger, because a policy
//      is row-level and cannot say "this column is yours and that one is not".
//   2. Only the person who was asked can accept.
//   3. A stranger sees nothing: not the friendship, not the row, not the name.
//   4. One pair is one row, whichever way round it was asked.
//   5. `profiles_select` was NOT widened. A friend can read your username and
//      display name through `my_friendships()` and cannot read your row.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'friendships.test.ts needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'and SUPABASE_SERVICE_ROLE_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

function uniqueUsername(prefix: string): string {
  return `${prefix}${randomUUID().replace(/[^a-f0-9]/g, '').slice(0, 10)}`;
}

describe('a friendship is two independent decisions, and neither is yours to make for someone else', () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let carol: SupabaseClient;

  let aliceId: string;
  let bobId: string;
  let aliceName: string;
  let bobName: string;
  let carolName: string;

  const password = `pw-${randomUUID()}`;

  async function signedInUser(
    prefix: string
  ): Promise<{ id: string; db: SupabaseClient; username: string }> {
    const email = `friends-${prefix}-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);

    const db = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await db.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`could not sign in test user: ${signInError.message}`);

    const username = uniqueUsername(prefix);
    await claimUsername(db, { userId: data.user.id, username, displayName: undefined });

    return { id: data.user.id, db, username };
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
    aliceName = a.username;
    bobName = b.username;
    carolName = c.username;
  });

  afterAll(async () => {
    // Deleting the users cascades to profiles and from there to friendships.
    for (const id of [aliceId, bobId]) {
      if (admin && id) await admin.auth.admin.deleteUser(id);
    }
    // Carol's id was not kept; find her by the friendship she is not in.
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email?.startsWith('friends-carol-')) {
        await admin.auth.admin.deleteUser(user.id);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Asking
  // -------------------------------------------------------------------------

  it('starts with nobody knowing anybody', async () => {
    const mine = await getFriends(alice);
    expect(mine.friends).toEqual([]);
    expect(mine.incoming).toEqual([]);
    expect(mine.outgoing).toEqual([]);
  });

  it('refuses a username that belongs to nobody, without saying why it is different', async () => {
    await expect(sendRequest(alice, aliceId, 'nobodyhasthisname')).rejects.toBeInstanceOf(
      NoSuchUser
    );
    // A malformed username gets the same answer as a missing one, so the shape
    // of the refusal teaches nothing either.
    await expect(sendRequest(alice, aliceId, 'A!!')).rejects.toBeInstanceOf(NoSuchUser);
  });

  it('refuses to let you add yourself', async () => {
    // `find_profile_by_username` excludes the caller, so this is the same
    // "nobody" as above rather than a special case anyone had to write.
    await expect(sendRequest(alice, aliceId, aliceName)).rejects.toBeInstanceOf(NoSuchUser);
  });

  it('sends a request, and both sides see it from their own side', async () => {
    await sendRequest(alice, aliceId, bobName);

    const hers = await getFriends(alice);
    expect(hers.outgoing).toHaveLength(1);
    expect(hers.incoming).toHaveLength(0);
    expect(hers.outgoing[0].other_username).toBe(bobName);

    const his = await getFriends(bob);
    expect(his.incoming).toHaveLength(1);
    expect(his.outgoing).toHaveLength(0);
    expect(his.incoming[0].other_username).toBe(aliceName);
  });

  it('will not let the same request be sent twice', async () => {
    await expect(sendRequest(alice, aliceId, bobName)).rejects.toBeInstanceOf(AlreadyAsked);
  });

  it('tells the other person their request is already waiting, rather than making a second row', async () => {
    // Bob asking Alice while her request to him is open. One pair is one row,
    // and the `least()/greatest()` index is what makes that true whichever way
    // round it was asked.
    await expect(sendRequest(bob, bobId, aliceName)).rejects.toBeInstanceOf(TheyAskedYou);
    expect((await getFriends(bob)).incoming).toHaveLength(1);
    expect((await getFriends(bob)).outgoing).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Accepting — and who may
  // -------------------------------------------------------------------------

  it('REFUSES to let the person who asked accept their own request', async () => {
    const id = (await getFriends(alice)).outgoing[0].id;

    // Alice sent it. The trigger in migration 017 is what stops this, not the
    // policy — the policy lets her update her own row, and must, because it is
    // also the row her own share level lives on.
    await expect(acceptRequest(alice, id)).rejects.toThrow();

    // Still pending, and still not a friendship.
    expect((await getFriends(alice)).friends).toHaveLength(0);
    expect((await getFriends(alice)).outgoing).toHaveLength(1);
  });

  it('lets the person who was asked accept', async () => {
    const id = (await getFriends(bob)).incoming[0].id;
    await acceptRequest(bob, id);

    expect((await getFriends(bob)).friends).toHaveLength(1);
    expect((await getFriends(alice)).friends).toHaveLength(1);
    expect((await getFriends(alice)).outgoing).toHaveLength(0);
  });

  it('refuses a second request between two people who are already friends', async () => {
    await expect(sendRequest(alice, aliceId, bobName)).rejects.toBeInstanceOf(AlreadyFriends);
  });

  // =========================================================================
  // THE INVARIANT — each side owns exactly one visibility column
  // =========================================================================

  it('starts both sides on free-or-busy, because accepting is the consent', async () => {
    const hers = (await getFriends(alice)).friends[0];
    const his = (await getFriends(bob)).friends[0];

    expect(hers.i_share).toBe('busy');
    expect(hers.they_share).toBe('busy');
    expect(his.i_share).toBe('busy');
    expect(his.they_share).toBe('busy');
  });

  it('lets each side change what they show, and shows the other side the change', async () => {
    const id = (await getFriends(alice)).friends[0].id;

    await setShareLevel(alice, aliceId, id, 'full');

    // Alice's own view: she shows full, Bob still shows busy.
    const hers = (await getFriends(alice)).friends[0];
    expect(hers.i_share).toBe('full');
    expect(hers.they_share).toBe('busy');

    // Bob's view is the mirror image, read off the same row.
    const his = (await getFriends(bob)).friends[0];
    expect(his.i_share).toBe('busy');
    expect(his.they_share).toBe('full');
  });

  it('KEEPS the two decisions independent — changing yours never moves theirs', async () => {
    const id = (await getFriends(bob)).friends[0].id;

    await setShareLevel(bob, bobId, id, 'none');

    const his = (await getFriends(bob)).friends[0];
    expect(his.i_share).toBe('none');
    // Alice's choice is untouched by Bob's.
    expect(his.they_share).toBe('full');

    const hers = (await getFriends(alice)).friends[0];
    expect(hers.i_share).toBe('full');
    expect(hers.they_share).toBe('none');
  });

  it('REFUSES to let one person change what the other shares', async () => {
    const id = (await getFriends(alice)).friends[0].id;

    // Alice writing Bob's column directly. She is allowed to update this row —
    // her own share level is on it — so nothing but the trigger stops her.
    const { error } = await alice
      .from('friendships')
      .update({ addressee_shares: 'full' })
      .eq('id', id);

    expect(error).not.toBeNull();

    // And Bob still shares nothing, which was his decision and stays his.
    expect((await getFriends(bob)).friends[0].i_share).toBe('none');
  });

  it('REFUSES to let either side re-point a friendship at somebody else', async () => {
    const id = (await getFriends(alice)).friends[0].id;

    const { error } = await alice
      .from('friendships')
      .update({ addressee_id: aliceId })
      .eq('id', id);

    expect(error).not.toBeNull();
  });

  it('REFUSES to un-accept a friendship', async () => {
    const id = (await getFriends(bob)).friends[0].id;

    const { error } = await bob
      .from('friendships')
      .update({ status: 'pending' })
      .eq('id', id);

    expect(error).not.toBeNull();
    expect((await getFriends(bob)).friends).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // A stranger
  // -------------------------------------------------------------------------

  it('shows a friendship to nobody outside it', async () => {
    // Carol is signed in and is nobody's friend. Through the function...
    const hers = await getFriends(carol);
    expect(hers.friends).toEqual([]);
    expect(hers.incoming).toEqual([]);
    expect(hers.outgoing).toEqual([]);

    // ...and straight at the table, where `friendships_select` is what answers.
    const { data } = await carol.from('friendships').select('*');
    expect(data).toEqual([]);
  });

  it('does NOT let a friend read your profile row — profiles_select was not widened', async () => {
    // docs/SCHEMA.md said this slice would widen `profiles_select` to accepted
    // friends. It does not: a policy is row-level, so that would hand a friend
    // every column, including slice 21's `dismissed_notices` and every column
    // added to `profiles` after today.
    const { data } = await bob.from('profiles').select('*').eq('id', aliceId);
    expect(data).toEqual([]);

    // What Bob can see of Alice is exactly the three fields `my_friendships()`
    // names, and no more.
    const friend = (await getFriends(bob)).friends[0];
    expect(friend.other_username).toBe(aliceName);
    expect(Object.keys(friend).sort()).toEqual([
      'created_at',
      'direction',
      'i_share',
      'id',
      'other_display_name',
      'other_id',
      'other_username',
      'status',
      'they_share',
    ]);
  });

  it('lets a stranger be added the ordinary way, and nothing about the first pair changes', async () => {
    await sendRequest(alice, aliceId, carolName);

    const hers = await getFriends(alice);
    expect(hers.friends).toHaveLength(1);
    expect(hers.outgoing).toHaveLength(1);
    // Bob still cannot see the request to Carol.
    expect((await getFriends(bob)).outgoing).toHaveLength(0);
    expect((await getFriends(bob)).incoming).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Ending it
  // -------------------------------------------------------------------------

  it('lets either side delete, and it is gone for both', async () => {
    const id = (await getFriends(bob)).friends[0].id;
    await removeFriendship(bob, id);

    expect((await getFriends(bob)).friends).toEqual([]);
    expect((await getFriends(alice)).friends).toEqual([]);
  });

  it('lets the same pair start again afterwards, because nothing was kept', async () => {
    // The declined-request record that does not exist is the reason this works
    // without a special case.
    await sendRequest(alice, aliceId, bobName);
    expect((await getFriends(bob)).incoming).toHaveLength(1);
  });
});
