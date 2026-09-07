import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  ProfileAlreadyExists,
  UsernameTaken,
  claimUsername,
  getProfile,
  isValidUsername,
  lookupByUsername,
} from '@/modules/profiles';

// THE test for slice 18.
//
// A username is the first thing in this project that one person types about
// another, and that makes it the first thing in this project with a privacy
// surface. Two properties are worth a test, and they pull in opposite
// directions:
//
//   (a) a username is unique, case-insensitively, and the *database* is what
//       decides that — not a select-then-insert in the service, which is wrong
//       in exactly the case that matters (two people, same name, same second).
//
//   (b) a username is findable by someone who already knows it, and by nobody
//       else. `profiles_select` returns your own row and nothing more, and the
//       only door past it is `find_profile_by_username` — exact match, one row.
//       If that function ever grows a prefix match, or if the policy is ever
//       widened "just to make search work", every account on the app becomes
//       enumerable by anyone signed in, and that cannot be taken back.
//
// (b) is why most of this file signs in as a real user rather than using the
// service-role key. The service key bypasses RLS, so a test written with it
// would pass whether the policy existed or not — it would prove nothing at all.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'username.test.ts needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'and SUPABASE_SERVICE_ROLE_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

/** A name nobody else in the table will have. Lowercase, letters only. */
function uniqueUsername(prefix: string): string {
  return `${prefix}${randomUUID().replace(/[^a-f0-9]/g, '').slice(0, 10)}`;
}

describe('a username is unique, and findable only by someone who knows it', () => {
  // Bypasses RLS. Used only to make and destroy the two test accounts.
  let admin: SupabaseClient;
  // Real sessions, subject to every policy. Used for everything being proved.
  let alice: SupabaseClient;
  let bob: SupabaseClient;

  let aliceId: string;
  let bobId: string;
  let aliceName: string;

  const password = `pw-${randomUUID()}`;

  async function signedInUser(email: string): Promise<{ id: string; db: SupabaseClient }> {
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

    return { id: data.user.id, db };
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const a = await signedInUser(`profiles-a-${randomUUID()}@example.com`);
    const b = await signedInUser(`profiles-b-${randomUUID()}@example.com`);
    aliceId = a.id;
    alice = a.db;
    bobId = b.id;
    bob = b.db;

    aliceName = uniqueUsername('alice');
  });

  afterAll(async () => {
    // Deleting the user cascades to the profile through
    // `references auth.users(id) on delete cascade`.
    if (admin && aliceId) await admin.auth.admin.deleteUser(aliceId);
    if (admin && bobId) await admin.auth.admin.deleteUser(bobId);
  });

  // -------------------------------------------------------------------------
  // (a) uniqueness
  // -------------------------------------------------------------------------

  it('rejects a malformed or reserved username without asking the database', () => {
    expect(isValidUsername('ab')).toBe(false); // too short
    expect(isValidUsername('a'.repeat(21))).toBe(false); // too long
    expect(isValidUsername('aadit chandra')).toBe(false); // a space
    expect(isValidUsername('aadit-chandra')).toBe(false); // a hyphen
    expect(isValidUsername('aadit@uni')).toBe(false); // an at sign

    // Reserved because each one is already a route segment in /app. Giving one
    // away means either breaking that URL later or taking a name off a person.
    expect(isValidUsername('today')).toBe(false);
    expect(isValidUsername('settings')).toBe(false);
    expect(isValidUsername('friends')).toBe(false);
    expect(isValidUsername('TODAY')).toBe(false); // normalised before checking

    expect(isValidUsername('aadit')).toBe(true);
    expect(isValidUsername('aadit_22')).toBe(true);
  });

  it('stores a claimed username lowercased, whatever was typed', async () => {
    const profile = await claimUsername(alice, {
      userId: aliceId,
      username: aliceName.toUpperCase(),
      displayName: 'Alice',
    });

    expect(profile.username).toBe(aliceName);
    expect(profile.id).toBe(aliceId);
    expect(profile.display_name).toBe('Alice');
  });

  it('refuses a second username for an account that already has one', async () => {
    await expect(
      claimUsername(alice, { userId: aliceId, username: uniqueUsername('alice2') })
    ).rejects.toBeInstanceOf(ProfileAlreadyExists);

    // And the original is untouched.
    const profile = await getProfile(alice, aliceId);
    expect(profile?.username).toBe(aliceName);
  });

  it('refuses a username someone else holds, in any casing', async () => {
    // The casing is the point. `Alice` and `alice` are the same name, and it is
    // the functional unique index on lower(username) that says so — not the
    // service, which never reads the table before inserting.
    await expect(
      claimUsername(bob, { userId: bobId, username: aliceName.toUpperCase() })
    ).rejects.toBeInstanceOf(UsernameTaken);

    // Bob is still nameless, so the failure left nothing half-written.
    expect(await getProfile(bob, bobId)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // (b) findable by name, and by nothing else
  // -------------------------------------------------------------------------

  it('finds Alice by her exact username', async () => {
    // The positive control, and it has to come first: without it, every
    // assertion below would also pass if the RPC were simply broken.
    const found = await lookupByUsername(bob, aliceName);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(aliceId);
    expect(found!.username).toBe(aliceName);
    expect(found!.display_name).toBe('Alice');
  });

  it('finds her whatever case the name is typed in', async () => {
    const found = await lookupByUsername(bob, `  ${aliceName.toUpperCase()}  `);
    expect(found?.id).toBe(aliceId);
  });

  it('THE INVARIANT: a prefix of a real username finds nobody', async () => {
    // If this ever fails, someone has made the lookup a search, and every
    // account on the app is now enumerable by anyone who can sign in.
    for (let length = 3; length < aliceName.length; length += 1) {
      const prefix = aliceName.slice(0, length);
      expect(await lookupByUsername(bob, prefix)).toBeNull();
    }

    // Nor a suffix, nor a fragment.
    expect(await lookupByUsername(bob, aliceName.slice(1))).toBeNull();
    expect(await lookupByUsername(bob, aliceName.slice(2, 6))).toBeNull();
    expect(await lookupByUsername(bob, `${aliceName}x`)).toBeNull();
  });

  it('never returns you to yourself', async () => {
    // `and p.id <> auth.uid()` in the function. You are not a person you can
    // send a friend request to, and slice 19 should not have to remember that.
    expect(await lookupByUsername(alice, aliceName)).toBeNull();
  });

  it('THE INVARIANT: Bob cannot read Alice\'s row directly, only through the RPC', async () => {
    // The RPC is `security definer` and so sees past `profiles_select`. This is
    // the proof that the policy underneath it is doing anything at all: the same
    // client, the same row, selected rather than looked up, comes back empty.
    const byId = await bob.from('profiles').select('*').eq('id', aliceId);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);

    const byName = await bob.from('profiles').select('*').eq('username', aliceName);
    expect(byName.error).toBeNull();
    expect(byName.data).toEqual([]);

    // And the whole table is just Bob — who at this point has no profile at all.
    const all = await bob.from('profiles').select('*');
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);
  });

  it('lets Bob read his own row once he has one', async () => {
    // The control for the test above: the policy is narrow, not broken.
    const bobName = uniqueUsername('bob');
    await claimUsername(bob, { userId: bobId, username: bobName });

    const own = await bob.from('profiles').select('*');
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(own.data![0].username).toBe(bobName);

    // And now Alice can find him by name, but still not by select.
    expect((await lookupByUsername(alice, bobName))?.id).toBe(bobId);
    expect((await alice.from('profiles').select('*')).data).toHaveLength(1);
  });
});
