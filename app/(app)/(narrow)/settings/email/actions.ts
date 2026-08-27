'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { syncAccount } from '@/modules/gmail';
import { disconnectGoogleAccountById } from '@/modules/google';
import { scanMailbox } from '@/modules/proposals';
import { ensureWorkspace } from '@/modules/workspaces';

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

  // Slice 15: pressing Sync is a person asking for their mail to be dealt with,
  // so the mail that just arrived is read straight away — and `scanMailbox`
  // gates every message on keywords before it spends anything, so a sync that
  // pulls forty newsletters costs nothing at all. The hourly cron job
  // deliberately does NOT do this: unattended model spend is a different
  // decision from a button press. See docs/DECISIONS.md.
  let proposed = 0;
  if (result.outcome === 'ok' && result.stored > 0) {
    const workspace = await ensureWorkspace(supabase, user.id);
    const scan = await scanMailbox(supabase, {
      workspaceId: workspace.id,
      userId: user.id,
    });
    proposed = scan.proposed;
    revalidatePath('/inbox');
  }

  revalidatePath('/settings/email');

  // `result.message` is written by modules/gmail and never contains a sender,
  // a subject or a snippet — it must not, because this lands in a URL.
  const params = new URLSearchParams({ outcome: result.outcome });
  if (result.outcome === 'ok') {
    params.set(
      'synced',
      result.stored === 0
        ? 'Up to date — nothing new.'
        : `${result.stored} new ${result.stored === 1 ? 'message' : 'messages'}.` +
            (proposed > 0
              ? ` ${proposed} ${proposed === 1 ? 'proposal is' : 'proposals are'} waiting in your inbox.`
              : '')
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
