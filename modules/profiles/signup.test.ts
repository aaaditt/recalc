import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { claimUsername, emailForUsername } from '@/modules/profiles';
import { ensureWorkspace } from '@/modules/workspaces';

// THE test for slice 27.
//
// What broke: a friend was sent a link, and the only two calls that could make
// him an account — `signInWithOtp` and `signInWithOAuth` — both hand the browser
// to Supabase, which returns it to the project's redirect allow-list and falls
// back to Site URL when nothing matches. Site URL said `http://localhost:3000`,
// so he was sent to a machine that was not running. The third door, a password,
// never redirects anywhere and was never broken — but `/login` refused to create
// accounts with it, so the one working door was shut to anybody new.
//
// Two things are worth being sure about, and they pull in opposite directions:
//
//   1. **A person can get in with nothing but an address and a password.** No
//      mail, no link, no redirect, no allow-list. If this breaks, the app is
//      unusable by anybody who is not already in it — which is exactly the state
//      slice 27 was written to end.
//
//   2. **The username -> email hop stays behind the service role.** Signing in
//      as "aadit" means turning that into an address somewhere, and that lookup
//      must never be reachable from a browser. If `anon` can call it, every
//      username on the app becomes an email address, and the friends feature
//      hands out the usernames for free.
//
// The second is the one a later session is likely to break, by granting the
// function to `authenticated` to save a round trip. That is why it is asserted
// against real anon and real signed-in clients rather than by reading the grant.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'signup.test.ts needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'and SUPABASE_SERVICE_ROLE_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

describe('a way in that needs no email', () => {
  let admin: SupabaseClient;
  let userId: string;
  let username: string;

  const email = `signup-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;

  function anonClient(): SupabaseClient {
    return createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  // =========================================================================
  // THE INVARIANT — signing up needs nothing but an address and a password
  // =========================================================================

  it('creates an account server-side and signs straight in, with no mail sent', async () => {
    // Exactly what `signUpWithPassword` does. `email_confirm: true` is what
    // keeps Supabase from mailing a confirmation link — the link that would
    // have pointed at localhost.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data?.user).not.toBeNull();
    userId = data!.user!.id;

    // The account is usable immediately, from a clean client with no cookie and
    // no prior redirect. This is the whole point of the slice.
    const fresh = anonClient();
    const signedIn = await fresh.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(userId);

    // Nothing was left pending: an unconfirmed account cannot sign in at all,
    // so a session here is itself the proof that no confirmation is outstanding.
    expect(signedIn.data.session).not.toBeNull();

    // And the new person can go on to claim a username, which is what /welcome
    // asks for on the very next screen.
    username = `su${randomUUID().replace(/[^a-f0-9]/g, '').slice(0, 10)}`;
    await ensureWorkspace(fresh, userId);
    await claimUsername(fresh, { userId, username });
  });

  // =========================================================================
  // THE INVARIANT — a username signs in, and the address stays on the server
  // =========================================================================

  it('turns a username into the address behind it, for the service role', async () => {
    expect(await emailForUsername(admin, username)).toBe(email);
  });

  it('matches a username case-insensitively, the way the friends lookup does', async () => {
    expect(await emailForUsername(admin, username.toUpperCase())).toBe(email);
  });

  it('signs in by username and reaches the same account as by email', async () => {
    // The whole of the username path in `signInWithPassword`.
    const resolved = await emailForUsername(admin, username);
    expect(resolved).not.toBeNull();

    const db = anonClient();
    const { data, error } = await db.auth.signInWithPassword({
      email: resolved!,
      password,
    });
    expect(error).toBeNull();
    expect(data.user?.id).toBe(userId);
  });

  it('answers null for a username nobody has, rather than throwing', async () => {
    expect(await emailForUsername(admin, `missing${randomUUID().slice(0, 8)}`)).toBeNull();
  });

  it('answers null for a malformed username without asking the database', async () => {
    expect(await emailForUsername(admin, 'not a username!!')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The half that must never loosen.
  // -------------------------------------------------------------------------

  it('refuses a signed-out browser: anon cannot turn a username into an email', async () => {
    const { error } = await anonClient().rpc('email_for_username', {
      p_username: username,
    });
    expect(error).not.toBeNull();
  });

  it('refuses a signed-in browser too — being a user is not being the server', async () => {
    const db = anonClient();
    const { error: signInError } = await db.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();

    const { error } = await db.rpc('email_for_username', { p_username: username });
    expect(error).not.toBeNull();
  });
});
