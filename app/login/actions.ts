'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { emailForUsername } from '@/modules/profiles';

async function currentOrigin(): Promise<string> {
  return (await headers()).get('origin') ?? 'http://localhost:3000';
}

/** Back to the form with a message, keeping what was typed in the first box. */
function back(message: string, identifier?: string): never {
  const query =
    '/login?error=' +
    encodeURIComponent(message) +
    (identifier ? '&identifier=' + encodeURIComponent(identifier) : '');
  redirect(query);
}

/** Anything with an '@' is meant to be an address; anything else is a username. */
function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}

/**
 * The shortest password this app will set. Supabase's own floor is six.
 *
 * Eight rather than six because this is the only credential on the account —
 * there is no second factor and, with slice 27, no requirement to prove you can
 * read the mailbox either. It is not a policy so much as the one number that
 * stops "1234" being someone's whole security.
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The way in — email **or** username, plus a password.
 *
 * Slice 27 added the username half. Supabase's `signInWithPassword` only takes
 * an address, so a username is turned into one first, on the server, with the
 * service-role client. The address is handed straight to Supabase; it is never
 * returned to the page, never put in the URL, and `email_for_username` is
 * granted to `service_role` alone so the browser could not ask for it anyway.
 *
 * The error stays one sentence for every failure — wrong password, unknown
 * username, unknown address. Telling them apart tells somebody whether an
 * account exists here, which is the one thing a sign-in form should not answer.
 * (Creating an account cannot avoid answering it. See `signUpWithPassword`.)
 */
export async function signInWithPassword(formData: FormData) {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!identifier || !password) {
    back('Enter your email or username, and your password.', identifier);
  }

  const wrong = 'That does not match an account. Check the password and try again.';

  let email = identifier;
  if (!looksLikeEmail(identifier)) {
    const found = await emailForUsername(createAdminClient(), identifier);
    // Deliberately the same sentence as a wrong password, and deliberately
    // still a round trip — answering "no such user" instantly would make the
    // two cases tellable apart by how long they took.
    if (!found) back(wrong, identifier);
    email = found;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) back(wrong, identifier);

  redirect('/today');
}

/**
 * Making an account, without an email round trip — slice 27.
 *
 * This is the fix for the thing that actually broke: `signInWithOtp` and
 * `signInWithOAuth` are the only two calls that create a user, both hand the
 * browser to Supabase, and Supabase sends it back to its own redirect
 * allow-list — which still said `http://localhost:3000`. The first person who
 * was not Aadit followed a link to a machine that was not running.
 *
 * So this does not use either. It creates the user with the service role and
 * `email_confirm: true`, which sends no mail and performs no redirect, then
 * signs in with the password that was just set. Nothing in this path depends on
 * the allow-list, on a mail server, or on the person being able to leave the
 * page and come back.
 *
 * `email_confirm: true` is a claim this app cannot check — nobody has proved
 * they can read that mailbox. That is the trade slice 27 makes on purpose: the
 * address here is a login name that happens to look like an email, and the only
 * thing it currently unlocks is a workspace of your own. Anything that mails a
 * person, or trusts the address to identify them, needs real verification first.
 *
 * Unlike signing in, this **must** admit that an address is taken — otherwise
 * the form has no way to tell you why it will not work. Account creation always
 * leaks existence; the sign-in form above still does not.
 */
export async function signUpWithPassword(formData: FormData) {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!looksLikeEmail(identifier)) {
    back('To make an account, put in an email address rather than a username.', identifier);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    back(`Pick a password of at least ${MIN_PASSWORD_LENGTH} characters.`, identifier);
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: identifier,
    password,
    email_confirm: true,
  });

  if (error) {
    // Supabase says "already been registered" for a taken address. Anything
    // else is this app's problem and is shown as itself rather than as a guess.
    const taken = /already/i.test(error.message);
    back(
      taken
        ? 'That email already has an account. Sign in instead.'
        : `That did not work: ${error.message}`,
      identifier
    );
  }

  // Sign the new account straight in, so making one and using one is a single
  // press. The proxy sends anyone without a username to /welcome, so that is
  // where this lands without having to say so.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: identifier,
    password,
  });

  if (signInError) {
    back('The account was made, but signing in failed. Try signing in.', identifier);
  }

  redirect('/welcome');
}

/**
 * The fallback, and now only that.
 *
 * It was the front door until slice 27 and is now the small print, because it
 * is the one path that still depends on the project's redirect allow-list: the
 * link Supabase mails points at Site URL unless the callback is listed. It is
 * kept because it is the only way back in for somebody who has forgotten their
 * password — there is no reset flow — and deleting it would trade a working
 * recovery for a tidier file.
 */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) back('Enter your email.');

  const origin = await currentOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) back(error.message);
  redirect('/login?sent=1');
}

/**
 * The other way in, added in slice 18.
 *
 * This signs you in. It does **not** grant Drive or Gmail access, and that
 * separation is deliberate rather than an oversight: those are separate,
 * explicit consents on /settings/drive and /settings/email, asking for scopes
 * that read your files and your mail. Bundling a restricted scope into a login
 * button is how an app ends up holding permissions nobody meant to give it.
 *
 * It reuses the same Google Cloud OAuth client the Drive and Gmail connect
 * flows use — one client per application, which is what a Google OAuth client
 * is (docs/GOOGLE_SETUP.md). Supabase needs its own callback added to that
 * client's authorised redirect URIs.
 *
 * In a server action the OAuth handshake does not redirect itself: Supabase
 * hands back the URL and this function is the thing that goes there.
 */
export async function signInWithGoogle() {
  const origin = await currentOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error) back(error.message);
  if (!data.url) {
    back('Google sign-in is not configured for this project yet.');
  }

  redirect(data.url);
}
