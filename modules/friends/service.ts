import type { SupabaseClient } from '@supabase/supabase-js';

import { lookupByUsername } from '@/modules/profiles';

import * as repo from './repo';
import {
  AlreadyAsked,
  AlreadyFriends,
  NoSuchUser,
  TheyAskedYou,
  shareLevelSchema,
  type FriendClass,
  type FriendLists,
  type Friendship,
  type ShareLevel,
} from './schema';

// Friends — the four things you can do, and the one screen that reads them.
//
// Almost every rule that matters here is in the database, because the anon key
// ships to the browser and a rule in TypeScript is a rule a POST can walk past.
// Migration 017 holds: who may accept, which column each side owns, that the two
// people never change, and that a pair can only exist once. What is in this file
// is the ordering of those calls and the sentences a person reads when one of
// them refuses.

/**
 * Everything the friends screen draws, in one round trip.
 *
 * Three groups out of one list, because they are three different things to a
 * person: the people you are friends with, the people waiting on you, and the
 * people you are waiting on. Only the middle one has buttons that matter.
 */
export async function getFriends(db: SupabaseClient): Promise<FriendLists> {
  const all = await repo.listMine(db);

  return {
    friends: all.filter((row) => row.status === 'accepted'),
    incoming: all.filter((row) => row.status === 'pending' && row.direction === 'incoming'),
    outgoing: all.filter((row) => row.status === 'pending' && row.direction === 'outgoing'),
  };
}

/**
 * Ask somebody by their exact username.
 *
 * There is no search and there is deliberately never going to be one: a lookup
 * permissive enough to find `@aadit` by typing `aad` is permissive enough to
 * list every account on this app. `lookupByUsername` is the single door through
 * `profiles_select`, and it is exact-match only (migration 013).
 *
 * The four refusals are four types rather than four strings, because the screen
 * says something different for each and matching on a message is how those
 * drift apart. Three of them are found before the insert; the fourth is the
 * unique index, and it is the one that decides — two people adding each other in
 * the same second is exactly when a pre-check is wrong.
 */
export async function sendRequest(
  db: SupabaseClient,
  userId: string,
  rawUsername: string
): Promise<void> {
  const username = rawUsername.trim().replace(/^@/, '');

  const found = await lookupByUsername(db, username);
  // Null covers both "nobody has that name" and "that is not a username at
  // all", which is the same answer as far as the screen is concerned — and
  // means the shape of the refusal teaches nothing either.
  if (!found) throw new NoSuchUser(username);

  // What is already between these two, if anything. Read from the list this
  // account can already see, so no extra door into `friendships` is needed.
  const existing = (await repo.listMine(db)).find((row) => row.other_id === found.id);
  if (existing?.status === 'accepted') throw new AlreadyFriends(found.username);
  if (existing?.direction === 'outgoing') throw new AlreadyAsked(found.username);
  if (existing?.direction === 'incoming') throw new TheyAskedYou(found.username);

  const { error } = await repo.insertRequest(db, userId, found.id);
  if (!error) return;

  // The index is what decides, not the check above.
  if (repo.isUniqueViolation(error)) throw new AlreadyAsked(found.username);
  throw new Error(`friends.sendRequest: ${error.message}`);
}

/**
 * Say yes.
 *
 * Only the person who was asked can, and that is enforced by the trigger in
 * migration 017 rather than by a check here — this function runs on a server
 * that could be lied to, and the trigger runs where the row is.
 */
export async function acceptRequest(db: SupabaseClient, id: string): Promise<void> {
  await repo.acceptRequest(db, id);
}

/**
 * Say no, take it back, or stop being friends.
 *
 * One function, because they are one act. A declined request leaves no record on
 * purpose: a stored refusal is a small social rejection the app would then have
 * to decide when to show and when to expire, and deleting it means the other
 * person's screen simply stops saying "pending".
 */
export async function removeFriendship(db: SupabaseClient, id: string): Promise<void> {
  await repo.removeFriendship(db, id);
}

/**
 * Change what you show one friend.
 *
 * The column is worked out from which side of the row you are on, and getting
 * that wrong is the one bug this table is shaped to make possible — so it is
 * worked out once, here, and the database refuses the write if it is wrong
 * anyway. Two independent decisions: this never touches what they show you.
 */
export async function setShareLevel(
  db: SupabaseClient,
  userId: string,
  id: string,
  level: ShareLevel
): Promise<void> {
  const parsed = shareLevelSchema.parse(level);

  const side = await repo.sideOf(db, id, userId);
  if (!side) throw new Error(`friends.setShareLevel: no friendship ${id} for this account`);

  await repo.updateShare(
    db,
    id,
    side === 'requester' ? 'requester_shares' : 'addressee_shares',
    parsed
  );
}

/**
 * What this friend lets me see — the question slice 23 will ask.
 *
 * `they_share`, never `i_share`. Naming the fields from the caller's point of
 * view is what makes that hard to get wrong, and this function exists so that
 * slice 23 has one place to be right rather than a `case` of its own.
 */
export function whatTheyShow(friendship: Friendship): ShareLevel {
  return friendship.they_share;
}

/**
 * One friend's week, and the friendship it came from — slice 23.
 *
 * Both in one call because a screen that has one without the other is a screen
 * that has to guess. An empty list means three different things — they share
 * `none`, they have nothing timetabled, or this is not a friend at all — and
 * only the friendship tells them apart. The database refuses the last of those
 * regardless of what this function is told.
 *
 * Two sequential round trips, and they cannot be made one: the second needs the
 * friend's id, which only the first knows. At ~606ms each that is the price of
 * this page, and it is paid once when it opens rather than per class.
 */
export async function getFriendWeek(
  db: SupabaseClient,
  username: string
): Promise<{ friendship: Friendship; classes: FriendClass[] } | null> {
  const friendship = (await repo.listMine(db)).find(
    (row) => row.other_username.toLowerCase() === username.trim().replace(/^@/, '').toLowerCase()
  );

  // Not a friend, or only asked. Null rather than an empty week, because "we are
  // not friends" and "they show me nothing" are different sentences.
  if (!friendship || friendship.status !== 'accepted') return null;

  return {
    friendship,
    classes: await repo.listFriendTimetable(db, friendship.other_id),
  };
}
