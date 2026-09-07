'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { dismiss, restore } from '@/modules/onboarding';

// Two actions, and both of them write the same single column.
//
// There is deliberately no `skipStepAction`. Skipping a step moves which step
// you are *looking at*, and that is a fact about this page view rather than
// about the account — so it is a link to `/start?step=<next>` and nothing is
// stored. It keeps "progress is derived, never stored" true with no exception,
// and it means the back button does the obvious thing.

/** "Don't show this again." Hides the line on /today; /start still works. */
export async function dismissOnboardingAction(): Promise<void> {
  const { user } = await requireWorkspace();
  await dismiss(await createClient(), user.id);

  // /today draws the line, and the shell above it is what re-renders.
  revalidatePath('/today');
  revalidatePath('/start');
  redirect('/today');
}

/** The way back, from settings. Dismissing is not a decision anyone is stuck with. */
export async function restoreOnboardingAction(): Promise<void> {
  const { user } = await requireWorkspace();
  await restore(await createClient(), user.id);

  revalidatePath('/today');
  revalidatePath('/start');
  redirect('/start');
}
