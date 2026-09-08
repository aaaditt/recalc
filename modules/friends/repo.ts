import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import {
  friendClassSchema,
  friendshipSchema,
  type FriendClass,
  type Friendship,
  type ShareLevel,
} from './schema';

// The only file that touches the friendships table. CLAUDE.md's Never rule 2.
//
// Reads go through `my_friendships()` rather than through a select, for the same
// reason `modules/profiles` reads another person through
// `find_profile_by_username`: `profiles_select` returns your own row and nothing
// else, so a join to get a friend's username has nowhere to join to. See
// migration 017 for why that policy was left alone rather than widened.
//
// Writes are ordinary statements under RLS. What each side is allowed to change
// is enforced by a trigger in the database — a policy is row-level and cannot
// say "this column is yours and that one is theirs", which is the entire shape
// of this table.

/** Postgres' unique-violation SQLSTATE — the pair index, here. */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === UNIQUE_VIOLATION;
}

/**
 * Every friendship this account is in, at any status, newest first.
 *
 * One round trip for the whole screen: the function joins the other person's
 * three public fields on its way out, so nothing here has to go back for names.
 */
export async function listMine(db: SupabaseClient): Promise<Friendship[]> {
  const { data, error } = await db.rpc('my_friendships');
  if (error) throw new Error(`friends.listMine: ${error.message}`);
  return (Array.isArray(data) ? data : []).map((row) => friendshipSchema.parse(row));
}

/**
 * Ask somebody.
 *
 * Returns the error rather than throwing it so the service can tell a duplicate
 * from a real failure without matching on a message string — the same shape
 * `modules/profiles`' insert uses, and for the same reason.
 */
export async function insertRequest(
  db: SupabaseClient,
  requesterId: string,
  addresseeId: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db.from('friendships').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
  });
  return { error };
}

/**
 * Accept.
 *
 * `.eq('status', 'pending')` as well as the id, so accepting twice is a no-op
 * rather than a second write — two taps on a slow connection is the normal way
 * this happens. Which *person* may accept is the trigger's business, not this
 * statement's.
 */
export async function acceptRequest(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(`friends.acceptRequest: ${error.message}`);
}

/**
 * Delete the row — which is declining, cancelling and unfriending at once.
 *
 * They are the same act ("there is no friendship here") and giving them one
 * statement means there is one thing to get right. The RLS policy allows it for
 * either party at any status.
 */
export async function removeFriendship(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('friendships').delete().eq('id', id);
  if (error) throw new Error(`friends.removeFriendship: ${error.message}`);
}

/**
 * Change what one side shows.
 *
 * The caller says which column, because only the caller knows which side of this
 * row it is on — and if it gets that wrong the trigger refuses the write rather
 * than quietly changing somebody else's mind for them.
 */
export async function updateShare(
  db: SupabaseClient,
  id: string,
  column: 'requester_shares' | 'addressee_shares',
  level: ShareLevel
): Promise<void> {
  const { error } = await db
    .from('friendships')
    .update({ [column]: level })
    .eq('id', id);
  if (error) throw new Error(`friends.updateShare: ${error.message}`);
}

/** Which side of this row the caller is on. One indexed lookup by primary key. */
export async function sideOf(
  db: SupabaseClient,
  id: string,
  userId: string
): Promise<'requester' | 'addressee' | null> {
  const { data, error } = await db
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`friends.sideOf: ${error.message}`);
  if (!data) return null;
  if (data.requester_id === userId) return 'requester';
  if (data.addressee_id === userId) return 'addressee';
  return null;
}

/**
 * One friend's week, at whatever level they share it.
 *
 * Through `friend_timetable` rather than a select, and `sessions_select` is
 * deliberately unchanged: `sessions` reaches a workspace only through `courses`,
 * so that policy is already two joins deep and widening it to friendships would
 * make it four tables and a direction-dependent column read — running on every
 * row of every query anyone ever writes against `sessions`. A mistake in a
 * policy that shape does not fail loudly; it returns somebody else's rows.
 * Migration 018 says the same thing at more length.
 *
 * Returns an empty list for `none`, for a pending request and for a stranger.
 * All three are the same answer from here, and the screen never has to tell them
 * apart from the data — it already knows the level from `my_friendships()`.
 */
export async function listFriendTimetable(
  db: SupabaseClient,
  friendId: string
): Promise<FriendClass[]> {
  const { data, error } = await db.rpc('friend_timetable', { p_friend_id: friendId });
  if (error) throw new Error(`friends.listFriendTimetable: ${error.message}`);
  return (Array.isArray(data) ? data : []).map((row) => friendClassSchema.parse(row));
}
