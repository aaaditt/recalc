'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  ProfileAlreadyExists,
  UsernameTaken,
  claimUsername,
  usernameProblem,
} from '@/modules/profiles';

// The only thing this app ever blocks anybody on.
//
// Everything else in setup — the term, the courses, the timetable, an API key,
// a Google account — is a step on a card that ticks itself off and can be
// skipped for ever, because the app renders perfectly well without any of them.
// A username is different: it is what one person types to add another, and
// there is no version of a friends list that works without one.

function back(query: Record<string, string>): never {
  redirect(`/welcome?${new URLSearchParams(query).toString()}`);
}

export async function claimUsernameAction(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '');
  const displayName = String(formData.get('displayName') ?? '');

  // Checked here as well as in the service so a typo comes back as one sentence
  // under the box rather than as a thrown zod error on a screen.
  const problem = usernameProblem(username);
  if (problem) back({ error: problem, username });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  try {
    await claimUsername(supabase, {
      userId: user.id,
      username,
      displayName,
    });
  } catch (error) {
    // Two failures worth different sentences, and one that is a real bug.
    if (error instanceof UsernameTaken) back({ error: error.message, username });
    // Already claimed — two tabs, or a back button. The name they have is fine;
    // send them in rather than telling them off.
    if (error instanceof ProfileAlreadyExists) redirect('/today');
    throw error;
  }

  redirect('/today');
}
