import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createCourse } from '@/modules/courses';
import { claimUsername, getProfile, setDisplayName } from '@/modules/profiles';
import { ensureWorkspace } from '@/modules/workspaces';

// THE test for slice 24.
//
// Until this slice there was no way to sign out of this app — twenty-three
// slices and not one line anywhere calling `signOut()` — and no way to sign in
// that did not depend on something outside it: the magic link needs you to go
// and read your email, Google needs a working OAuth client.
//
// So a password was added, and the only place to set one is `/settings/account`,
// while already signed in. That is the shape worth being sure about:
//
//   1. **Setting a password does not make a new account.** It changes the
//      password of whoever the session says you are. The failure this guards
//      against is "you now have a password, and your semester is gone" — the id,
//      the workspace, the username and the courses must all be exactly the same
//      afterwards, and you must be able to sign in with the new password and
//      find them.
//
//   2. **Signing out actually ends the session.** Not "the cookie was cleared
//      and the token still works". After `signOut` the same client reads nothing
//      at all, because RLS has nobody to be.
//
// Real sessions on the anon key throughout. The service-role key bypasses RLS,
// so a signed-out client tested with it would still read everything and the
// second property would pass against no implementation at all.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'account.test.ts needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'and SUPABASE_SERVICE_ROLE_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

describe('setting a password keeps you the same person, and signing out really signs you out', () => {
  let admin: SupabaseClient;
  let me: SupabaseClient;

  let userId: string;
  let workspaceId: string;
  let username: string;
  let courseId: string;

  const email = `account-${randomUUID()}@example.com`;
  const firstPassword = `first-${randomUUID()}`;
  const newPassword = `second-${randomUUID()}`;

  /** A fresh anon client signed in with whatever password is current. */
  async function signIn(password: string): Promise<SupabaseClient> {
    const db = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`could not sign in: ${error.message}`);
    return db;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: firstPassword,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    me = await signIn(firstPassword);

    // A semester, so that "the account survived" means something more than a row
    // in `profiles`.
    workspaceId = (await ensureWorkspace(me, userId)).id;
    username = `acct${randomUUID().replace(/[^a-f0-9]/g, '').slice(0, 10)}`;
    await claimUsername(me, { userId, username });
    courseId = (
      await createCourse(me, {
        workspaceId,
        code: 'MA201',
        name: 'Linear Algebra',
        term: 'This term',
        colour: null,
      })
    ).id;
  });

  afterAll(async () => {
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  // =========================================================================
  // THE INVARIANT
  // =========================================================================

  it('changes the password without changing anything else about the account', async () => {
    const { data, error } = await me.auth.updateUser({ password: newPassword });

    expect(error).toBeNull();
    // Same person. Not a new row, not a second account with the same email.
    expect(data.user?.id).toBe(userId);
    expect(data.user?.email).toBe(email);
  });

  it('signs in with the new password and finds the same semester waiting', async () => {
    const again = await signIn(newPassword);

    // The same auth user...
    const { data } = await again.auth.getUser();
    expect(data.user?.id).toBe(userId);

    // ...the same workspace, not a second one made on the way in...
    expect((await ensureWorkspace(again, userId)).id).toBe(workspaceId);

    // ...the same username...
    expect((await getProfile(again, userId))?.username).toBe(username);

    // ...and the course is still there, read under RLS as that user.
    const { data: courses } = await again
      .from('courses')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect(courses).toHaveLength(1);
    expect(courses![0].id).toBe(courseId);

    await again.auth.signOut();
  });

  it('stops accepting the old password', async () => {
    const stale = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await stale.auth.signInWithPassword({
      email,
      password: firstPassword,
    });

    expect(error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // The display name — the one thing about yourself that is editable
  // -------------------------------------------------------------------------

  it('sets and clears the display name without touching the username', async () => {
    const signedIn = await signIn(newPassword);

    await setDisplayName(signedIn, userId, 'Aadit C');
    let profile = await getProfile(signedIn, userId);
    expect(profile?.display_name).toBe('Aadit C');
    expect(profile?.username).toBe(username);

    // Empty means "just be @username" rather than an empty string somebody's
    // screen would render as a blank name.
    await setDisplayName(signedIn, userId, null);
    profile = await getProfile(signedIn, userId);
    expect(profile?.display_name).toBeNull();
    expect(profile?.username).toBe(username);

    await signedIn.auth.signOut();
  });

  // =========================================================================
  // Signing out
  // =========================================================================

  it('READS NOTHING once signed out — the session is over, not just forgotten', async () => {
    const signedIn = await signIn(newPassword);

    // Before: this account can see its own workspace.
    const before = await signedIn.from('workspaces').select('id').eq('id', workspaceId);
    expect(before.data).toHaveLength(1);

    await signedIn.auth.signOut({ scope: 'global' });

    // After: the same client is nobody, so every policy in the app returns
    // nothing. This is the assertion that would pass against no implementation
    // at all if it were written with the service-role key.
    const { data: user } = await signedIn.auth.getUser();
    expect(user.user).toBeNull();

    const after = await signedIn.from('workspaces').select('id').eq('id', workspaceId);
    expect(after.data ?? []).toEqual([]);

    const courses = await signedIn.from('courses').select('id');
    expect(courses.data ?? []).toEqual([]);
  });

  it('leaves the account itself intact, so signing back in finds everything', async () => {
    // Signing out is not deleting. The next sign-in is the same semester.
    const back = await signIn(newPassword);

    expect((await ensureWorkspace(back, userId)).id).toBe(workspaceId);
    expect((await getProfile(back, userId))?.username).toBe(username);

    await back.auth.signOut();
  });
});
