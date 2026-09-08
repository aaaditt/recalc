'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import {
  AlreadyAsked,
  AlreadyFriends,
  NoSuchUser,
  TheyAskedYou,
  acceptRequest,
  removeFriendship,
  sendRequest,
  setShareLevel,
  shareLevelSchema,
} from '@/modules/friends';

// Routing only, as CLAUDE.md's layout rule asks.
//
// Nothing here decides who may do what — that is all in migration 017, because
// the anon key ships to the browser and a rule in a server action is a rule
// somebody can POST past. What these do is call the module and put a sentence in
// the URL when it refuses.

function back(query: Record<string, string> = {}): never {
  const search = new URLSearchParams(query).toString();
  redirect(search ? `/friends?${search}` : '/friends');
}

/**
 * Ask somebody by their exact username.
 *
 * The four refusals are four types in the module and four different sentences
 * here, because "nobody has that name" and "they have already asked you" want
 * completely different next moves from the person reading them.
 */
export async function addFriendAction(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '').trim();
  if (!username) back();

  const { user } = await requireWorkspace();

  try {
    await sendRequest(await createClient(), user.id, username);
  } catch (error) {
    if (
      error instanceof NoSuchUser ||
      error instanceof AlreadyFriends ||
      error instanceof AlreadyAsked ||
      error instanceof TheyAskedYou
    ) {
      back({ error: error.message, username });
    }
    throw error;
  }

  revalidatePath('/friends');
  back({ asked: username });
}

/** Say yes. Only the person who was asked can, and the database is what says so. */
export async function acceptRequestAction(id: string): Promise<void> {
  // Called for the throw, not for the value: a server action is a public POST
  // and this one must not run for a signed-out request. Which *person* may
  // accept is the trigger's business — see migration 017.
  await requireWorkspace();
  await acceptRequest(await createClient(), id);
  revalidatePath('/friends');
  back();
}

/**
 * Say no, take it back, or stop being friends.
 *
 * One action, because they are one act — see modules/friends/service.ts.
 */
export async function removeFriendAction(id: string): Promise<void> {
  await requireWorkspace();
  await removeFriendship(await createClient(), id);
  revalidatePath('/friends');
  back();
}

/**
 * Change what you show one friend.
 *
 * The level is parsed rather than trusted: a server action is a public POST, and
 * this one writes a column that decides what another person can see. The check
 * constraint in migration 017 would catch it anyway; this makes the refusal a
 * sentence rather than a 500.
 */
export async function setShareAction(id: string, formData: FormData): Promise<void> {
  const parsed = shareLevelSchema.safeParse(String(formData.get('level') ?? ''));
  if (!parsed.success) back({ error: 'That is not a sharing level.' });

  const { user } = await requireWorkspace();
  await setShareLevel(await createClient(), user.id, id, parsed.data);

  revalidatePath('/friends');
  back();
}
