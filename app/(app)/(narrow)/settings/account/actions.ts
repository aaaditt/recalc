'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { setDisplayName } from '@/modules/profiles';

// The account: the three things you can do to yourself — slice 24.
//
// Before this slice there was no way to sign out of this app at all. Not a
// button, not a route, nothing that called `signOut()`. That is the kind of gap
// that survives twenty-three slices because the person building it is always
// already signed in.

function back(query: Record<string, string> = {}): never {
  const search = new URLSearchParams(query).toString();
  redirect(search ? `/settings/account?${search}` : '/settings/account');
}

/**
 * What a friend sees. The username itself is not editable, deliberately —
 * slice 18 — because it is what somebody else types to add you.
 */
export async function setDisplayNameAction(formData: FormData): Promise<void> {
  const { user } = await requireWorkspace();
  const name = String(formData.get('displayName') ?? '').trim();

  await setDisplayName(await createClient(), user.id, name === '' ? null : name);

  revalidatePath('/settings/account');
  back({ saved: 'name' });
}

/**
 * Set or change your password.
 *
 * This is the important one, and it is what makes `/login`'s password field
 * usable at all: there is no sign-up-with-a-password path in this app, so the
 * only way an account gets a password is here, while already signed in.
 *
 * `updateUser` changes the password of whoever the session says you are — the
 * account is not re-created and nothing about it moves, so the workspace, the
 * username and every note stay exactly where they were. The test for that is
 * `modules/profiles/account.test.ts`, because "you now have a password but your
 * semester is gone" is the failure worth being sure about.
 *
 * Typed twice, because you cannot see what you typed and getting it wrong locks
 * you out of a door you just built.
 */
export async function setPasswordAction(formData: FormData): Promise<void> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  // Supabase's own floor is 6; this is the app's, and it is stated on the form
  // rather than discovered by failing.
  if (password.length < 8) {
    back({ error: 'A password needs at least 8 characters.' });
  }
  if (password !== confirm) {
    back({ error: 'Those two do not match.' });
  }

  await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) back({ error: error.message });

  revalidatePath('/settings/account');
  back({ saved: 'password' });
}

/**
 * Sign out.
 *
 * `scope: 'global'` ends every session on every device, not just this browser's.
 * That is the behaviour a person expects from the word — "sign me out" said on a
 * laptop you are about to hand back means all of them — and the alternative
 * leaves a session alive somewhere you cannot see.
 *
 * The redirect goes to `/login` rather than `/`, because `/` is behind the proxy
 * and would bounce you to `/login` anyway; going straight there means one round
 * trip instead of two on the one action people press when they are in a hurry.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();

  // `global` needs a live session to revoke, so it can fail on a token that has
  // already expired — which is exactly when somebody presses this. A sign-out
  // that quietly did nothing would be the worst bug in this slice, so the
  // failure falls back to a local one rather than being ignored: better to end
  // this browser's session and say nothing about the others than to leave
  // somebody signed in on a screen that told them they were not.
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.error('signOut: global sign-out failed, falling back to local', error);
    await supabase.auth.signOut({ scope: 'local' });
  }

  // Every cached page in the shell was rendered for somebody who is no longer
  // signed in.
  revalidatePath('/', 'layout');
  redirect('/login');
}
