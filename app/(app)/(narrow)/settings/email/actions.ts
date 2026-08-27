'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { syncAccount } from '@/modules/gmail';
import { disconnectGoogleAccountById } from '@/modules/google';

// Routing only: who is asking, hand it to the module, say what moved.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return { supabase, user };
}

/**
 * The "Sync now" button.
 *
 * `syncAccount` does not throw for anything the user can fix, so this never
 * shows a stack trace: a dead token, a missing scope and a Google outage all
 * come back as an outcome and end up as one sentence in the query string.
 * prompts/14-email-connect.md point 5.
 */
export async function syncEmailAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get('accountId') ?? '');
  if (!accountId) return;

  const { supabase, user } = await requireUser();
  const result = await syncAccount(supabase, user.id, accountId);

  revalidatePath('/settings/email');

  // `result.message` is written by modules/gmail and never contains a sender,
  // a subject or a snippet — it must not, because this lands in a URL.
  const params = new URLSearchParams({ outcome: result.outcome });
  if (result.outcome === 'ok') {
    params.set(
      'synced',
      result.stored === 0
        ? 'Up to date — nothing new.'
        : `${result.stored} new ${result.stored === 1 ? 'message' : 'messages'}.`
    );
  } else if (result.message) {
    params.set('error', result.message);
  }

  redirect(`/settings/email?${params.toString()}`);
}

/** Forget one connection, and ask Google to forget it too. */
export async function disconnectEmailAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get('accountId') ?? '');
  if (!accountId) return;

  const { supabase, user } = await requireUser();
  await disconnectGoogleAccountById(supabase, user.id, accountId);

  revalidatePath('/settings/email');
  // The same row is what /settings/drive shows.
  revalidatePath('/settings/drive');
}
