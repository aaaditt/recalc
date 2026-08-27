'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { acceptProposal, rejectProposal, scanMailbox } from '@/modules/proposals';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only: who is asking, hand it to the module, say what moved.
//
// Every one of these takes a proposal id that arrives from a browser. None of
// them checks it here — modules/proposals proves it against this user's own
// mail before it writes, so no call site can forget the check because no call
// site performs it. That is the pattern slices 04 through 14 arrived at the
// hard way (docs/DECISIONS.md).
//
// The session is re-derived on every call. A server action is a public POST
// endpoint, and the fact that the page which rendered the button was behind
// auth proves nothing about the request that arrives.

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const workspace = await ensureWorkspace(supabase, user.id);
  return { supabase, ctx: { workspaceId: workspace.id, userId: user.id } };
}

function back(params: Record<string, string>): never {
  redirect(`/inbox?${new URLSearchParams(params).toString()}`);
}

/**
 * "Read the mail that has arrived."
 *
 * The only thing in this app that spends model calls on email, and it spends
 * them only when a person presses the button. The cheap gate runs first inside
 * `scanMailbox`, so a mailbox of newsletters costs nothing at all.
 */
export async function scanMailboxAction(): Promise<void> {
  const { supabase, ctx } = await signedIn();
  const summary = await scanMailbox(supabase, ctx);

  revalidatePath('/inbox');

  back({
    scanned:
      summary.message ??
      (summary.proposed === 0
        ? `Read ${summary.called} ${summary.called === 1 ? 'email' : 'emails'} — nothing new to propose.`
        : `${summary.proposed} ${summary.proposed === 1 ? 'proposal' : 'proposals'} from ${summary.called} ${summary.called === 1 ? 'email' : 'emails'}.`),
  });
}

/**
 * The tap that is allowed to write a task.
 *
 * `courseId` comes from the form because the screen is where "which course is
 * this?" is asked when the gate was not sure. An empty value means "leave it
 * unfiled" — which is a real answer, and better than a guess.
 */
export async function acceptProposalAction(formData: FormData): Promise<void> {
  const proposalId = String(formData.get('proposalId') ?? '');
  if (!proposalId) return;

  const chosen = String(formData.get('courseId') ?? '').trim();

  const { supabase, ctx } = await signedIn();
  const result = await acceptProposal(supabase, ctx, proposalId, {
    courseId: chosen === '' ? null : chosen,
  });

  revalidatePath('/inbox');
  // A new task, or a lecture that just changed.
  revalidatePath('/tasks');
  revalidatePath('/today');
  revalidatePath('/calendar');

  back(
    result.ok
      ? { done: result.taskId ? 'Task added.' : 'The lecture has been updated.' }
      : { error: result.error }
  );
}

/** "No." The row is kept, so this email can never propose it again. */
export async function rejectProposalAction(formData: FormData): Promise<void> {
  const proposalId = String(formData.get('proposalId') ?? '');
  if (!proposalId) return;

  const { supabase, ctx } = await signedIn();
  const result = await rejectProposal(supabase, ctx, proposalId);

  revalidatePath('/inbox');
  back(result.ok ? { done: 'Rejected. It will not be proposed again.' } : { error: result.error });
}
