'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

async function currentOrigin(): Promise<string> {
  return (await headers()).get('origin') ?? 'http://localhost:3000';
}

/**
 * The ordinary way in — slice 24.
 *
 * Added because the other two both depend on something outside this app: the
 * magic link needs you to go and read your email, and Google needs a working
 * OAuth client. A password needs neither, which is what makes it the one that
 * works at 7:45am on a phone.
 *
 * Nothing here creates an account. Setting a password is done from
 * `/settings/account` while signed in, so there is no path through this form
 * that makes a new user, and a typo in an email address is "that did not work"
 * rather than a second empty account.
 *
 * The error is deliberately the same sentence for a wrong password and an
 * unknown email. Telling them apart tells somebody whether an address has an
 * account here, which is the one thing a login form should not answer.
 */
export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Enter your email and password.'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(
      '/login?error=' +
        encodeURIComponent('That email and password do not match an account.') +
        '&email=' +
        encodeURIComponent(email)
    );
  }

  redirect('/today');
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) redirect('/login?error=' + encodeURIComponent('Enter your email.'));

  const origin = await currentOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) redirect('/login?error=' + encodeURIComponent(error.message));
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

  if (error) redirect('/login?error=' + encodeURIComponent(error.message));
  if (!data.url) {
    redirect(
      '/login?error=' +
        encodeURIComponent('Google sign-in is not configured for this project yet.')
    );
  }

  redirect(data.url);
}
