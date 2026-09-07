import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  foundProfileSchema,
  profileSchema,
  type FoundProfile,
  type Profile,
} from './schema';

// The only file that touches the profiles table. CLAUDE.md's Never rule 2.

/** Postgres' unique-violation SQLSTATE. The only error code this module reads. */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === UNIQUE_VIOLATION;
}

/**
 * This account's profile, or null if it has not claimed a username yet.
 *
 * Null is the normal state for exactly one page load — the one between signing
 * in for the first time and the welcome screen — so it is a value, not an error.
 */
export async function findByUserId(
  db: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`profiles.findByUserId: ${error.message}`);
  return data ? profileSchema.parse(data) : null;
}

/**
 * Claim a username.
 *
 * Returns the `PostgrestError` rather than throwing it so the service can tell
 * a unique violation ("taken") from a real failure without matching on a
 * message string. Everything else in this file throws, because everything else
 * has only one way to go wrong.
 */
export async function insert(
  db: SupabaseClient,
  row: { id: string; username: string; display_name: string | null }
): Promise<{ profile: Profile; error: null } | { profile: null; error: PostgrestError }> {
  const { data, error } = await db.from('profiles').insert(row).select('*').single();
  if (error) return { profile: null, error };
  return { profile: profileSchema.parse(data), error: null };
}

/** Rename yourself in the friendly sense. The username is not touched. */
export async function updateDisplayName(
  db: SupabaseClient,
  userId: string,
  displayName: string | null
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`profiles.updateDisplayName: ${error.message}`);
  return profileSchema.parse(data);
}

/**
 * Somebody else, by their exact username.
 *
 * Goes through the `find_profile_by_username` RPC and not through a `select`,
 * because `profiles_select` only ever returns your own row — see migration 013.
 * That is the point: this RPC is the single door past that policy, so this
 * function is the single caller of it, and there is no `ilike` anywhere in this
 * module to be widened into a search by a later session.
 */
export async function findByUsername(
  db: SupabaseClient,
  username: string
): Promise<FoundProfile | null> {
  const { data, error } = await db.rpc('find_profile_by_username', {
    p_username: username,
  });
  if (error) throw new Error(`profiles.findByUsername: ${error.message}`);

  // The function is `returns table (...) limit 1`, so this is an array of zero
  // or one. Reading [0] rather than trusting the limit keeps it honest.
  const rows = Array.isArray(data) ? data : [];
  return rows.length > 0 ? foundProfileSchema.parse(rows[0]) : null;
}

/**
 * Mark the guided setup path as dismissed, or un-dismiss it.
 *
 * A timestamp rather than a boolean: "when did they decide they were done with
 * this" is worth being able to answer, and `is not null` is the flag. Passing
 * null puts it back, which is what the "start again" link on /start does.
 */
export async function updateOnboardingDismissed(
  db: SupabaseClient,
  userId: string,
  at: string | null
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .update({ onboarding_dismissed_at: at, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`profiles.updateOnboardingDismissed: ${error.message}`);
  return profileSchema.parse(data);
}
