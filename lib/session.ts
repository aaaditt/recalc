import { cache } from 'react';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace, type Workspace } from '@/modules/workspaces';

// Who is asking, and which workspace is theirs — asked once per request.
//
// Slice 19. Every signed-in screen in this app opens the same way: make a
// client, `getUser()`, `ensureWorkspace()`. The shell in app/(app)/layout.tsx
// does it to draw the /review badge and the page does it again to fetch its own
// data, so a single navigation made two identical auth calls and two identical
// selects on `workspaces`. Against a database ~606ms away that is not a tidiness
// problem, it is a second of blank screen.
//
// `cache()` is React's per-request memo: the first caller in a request pays for
// the call and every caller after it gets the same promise back. It is scoped to
// one request, so nothing here is ever shared between two people or two
// navigations — which is the only property that would make caching a *user*
// dangerous.
//
// Note what is deliberately NOT cached: `getUser()` itself still validates the
// JWT against Supabase on the first call. It is a network round trip on purpose
// and this slice does not remove it — a server action is a public POST endpoint,
// and the page that rendered the button proves nothing about the request that
// arrives. What this removes is asking the same question twice.

/** The signed-in user, or null. One auth round trip per request, at most. */
export const currentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * This request's user and their workspace, for the screens that need both.
 *
 * Returns null signed out rather than throwing, because a Server Component that
 * renders during a redirect should draw nothing, not crash. Server actions want
 * the opposite and use `requireWorkspace` below.
 */
export const currentWorkspace = cache(
  async (): Promise<{ user: User; workspace: Workspace } | null> => {
    const user = await currentUser();
    if (!user) return null;

    const supabase = await createClient();
    return { user, workspace: await ensureWorkspace(supabase, user.id) };
  }
);

/**
 * The same thing, for a server action, where being signed out is an error and
 * not a state to render.
 */
export async function requireWorkspace(): Promise<{ user: User; workspace: Workspace }> {
  const found = await currentWorkspace();
  if (!found) throw new Error('not signed in');
  return found;
}
