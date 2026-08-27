'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  acceptPreview,
  discardDerivation,
  keepOldVersion,
  previewDerivation,
} from '@/modules/recalc';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only: who is asking, hand it to the module, say what moved.
//
// Every one of these takes a derivation id that arrives from a browser. None of
// them checks it here — modules/recalc proves it against this workspace before
// it writes, so no call site can forget the check because no call site performs
// it. That is the pattern slices 04 through 10 arrived at the hard way
// (docs/DECISIONS.md).
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

/**
 * The nav badge lives in the app shell, so a change to the queue has to
 * revalidate the layout as well as this page — otherwise the number stays put
 * until the next full navigation.
 */
function refreshQueue() {
  revalidatePath('/review');
  revalidatePath('/', 'layout');
}

/** Generate the new version and show it. Writes nothing at all. */
export async function regenerateAction(derivationId: string) {
  const { supabase, ctx } = await signedIn();

  const result = await previewDerivation(supabase, ctx, derivationId);
  if (!result.ok) return { ok: false as const, error: result.error };

  return {
    ok: true as const,
    preview: {
      text: result.preview.text,
      model: result.preview.model,
      sources: result.preview.sources,
    },
  };
}

/**
 * Accept the version that was shown.
 *
 * The text and the versions come back from the browser because the point of the
 * screen is that this exact version was read and approved. The versions are
 * used only to prove nothing moved in between — what lands on the receipt is
 * the server's own fresh read. See modules/recalc/worker.ts.
 */
export async function acceptAction(
  derivationId: string,
  preview: { text: string; sources: { blockId: string; version: number }[] }
) {
  const { supabase, ctx } = await signedIn();

  const result = await acceptPreview(supabase, ctx, {
    derivationId,
    text: preview.text,
    sources: preview.sources,
  });

  refreshQueue();
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}

/** The summary still stands. Stop asking, against the note as it is now. */
export async function keepOldAction(derivationId: string): Promise<void> {
  const { supabase, ctx } = await signedIn();

  await keepOldVersion(supabase, ctx, derivationId);
  refreshQueue();
}

/** This summary was not worth having. The block is kept, soft-deleted. */
export async function deleteDerivationAction(derivationId: string): Promise<void> {
  const { supabase, ctx } = await signedIn();

  await discardDerivation(supabase, ctx, derivationId);
  refreshQueue();
}
