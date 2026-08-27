'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { indexWorkspace } from '@/modules/search';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only: who is asking, hand it to the module, say what moved.
//
// The session is re-derived here rather than trusted from the page that drew
// the button. A server action is a public POST endpoint, and the fact that the
// screen behind it was behind auth proves nothing about the request that
// arrives.
//
// There is no "search" action: searching is a GET with `?q=`, so a search is
// linkable, back-navigable and refreshable, and needs no JavaScript at all.

/**
 * Embed the passages whose version has moved on.
 *
 * One batch per press. `remaining` comes back so the screen can say whether
 * there is more, and every failure — no embed role, an unreadable key, a
 * provider that refused — comes back as a sentence rather than a thrown error,
 * because search still works without any of it.
 */
export async function indexAction(): Promise<{
  embedded: number;
  remaining: number;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const workspace = await ensureWorkspace(supabase, user.id);
  const result = await indexWorkspace(supabase, {
    workspaceId: workspace.id,
    userId: user.id,
  });

  revalidatePath('/search');
  return { embedded: result.embedded, remaining: result.remaining, error: result.error };
}
