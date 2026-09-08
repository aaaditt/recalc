import type { SupabaseClient } from '@supabase/supabase-js';
import * as repo from './repo';
import {
  claimUsernameInputSchema,
  normaliseUsername,
  usernameSchema,
  ProfileAlreadyExists,
  UsernameTaken,
  type ClaimUsernameInput,
  type FoundProfile,
  type Profile,
} from './schema';

/**
 * This account's profile, or null if it has not claimed a username yet.
 *
 * The proxy reads this on the way into every page, so it is one indexed lookup
 * on a primary key and nothing more.
 */
export async function getProfile(
  db: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  return repo.findByUserId(db, userId);
}

/**
 * Has this account been through the welcome screen?
 *
 * A separate function from `getProfile` because the proxy only needs the
 * boolean, and a caller that asks for less is a caller that cannot accidentally
 * put a username somewhere it should not be.
 */
export async function hasProfile(
  db: SupabaseClient,
  userId: string
): Promise<boolean> {
  return (await repo.findByUserId(db, userId)) !== null;
}

/**
 * Claim a username. Once.
 *
 * Deliberately *not* called `ensureProfile`, and deliberately not called from
 * the auth callback: there is no username this app could invent for someone
 * that they would want to keep. `aaditchandra2212` is what an auto-generated
 * one looks like, and nobody ever changes it. So a new account has no profile
 * until a person types one in, and the welcome screen is the only caller.
 *
 * Two failures a screen has to tell apart, and both are types rather than
 * strings: the name is gone, or you already have one.
 */
export async function claimUsername(
  db: SupabaseClient,
  input: ClaimUsernameInput
): Promise<Profile> {
  const parsed = claimUsernameInputSchema.parse(input);

  // Checked before the insert because "you already have a name" is a different
  // sentence from "that name is taken", and the unique index cannot tell them
  // apart — a second claim collides on the primary key, not on the username.
  const existing = await repo.findByUserId(db, parsed.userId);
  if (existing) throw new ProfileAlreadyExists();

  const { profile, error } = await repo.insert(db, {
    id: parsed.userId,
    username: parsed.username,
    display_name: parsed.displayName,
  });

  if (error) {
    // The index is what decides, not a select-then-insert: two people claiming
    // the same name in the same second is exactly when a pre-check is wrong.
    if (repo.isUniqueViolation(error)) throw new UsernameTaken(parsed.username);
    throw new Error(`profiles.claimUsername: ${error.message}`);
  }

  return profile;
}

/** Change what a friend sees. The username itself is not editable in this slice. */
export async function setDisplayName(
  db: SupabaseClient,
  userId: string,
  displayName: string | null
): Promise<Profile> {
  const trimmed = displayName?.trim();
  return repo.updateDisplayName(db, userId, trimmed ? trimmed : null);
}

/**
 * Find one person by their exact username.
 *
 * Returns null both when nobody has that name and when the name is malformed,
 * which is the same answer as far as the screen is concerned — and means a
 * caller cannot use the *shape* of a rejection to learn anything either.
 *
 * There is no `searchProfiles`. See modules/profiles/repo.ts.
 */
export async function lookupByUsername(
  db: SupabaseClient,
  rawUsername: string
): Promise<FoundProfile | null> {
  const parsed = usernameSchema.safeParse(rawUsername);
  if (!parsed.success) return null;
  return repo.findByUsername(db, parsed.data);
}

/** Whether a username could be claimed at all, before asking the database. */
export function isValidUsername(raw: string): boolean {
  return usernameSchema.safeParse(raw).success;
}

/** The first message a malformed username earns, or null if it is fine. */
export function usernameProblem(raw: string): string | null {
  const parsed = usernameSchema.safeParse(raw);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? 'That username will not work.';
}

export { normaliseUsername };

// ---------------------------------------------------------------------------
// Notices — "I have seen this" — slice 21
// ---------------------------------------------------------------------------
//
// One mechanism, shared. `modules/onboarding` dismisses `setup`; `modules/hints`
// dismisses the five feature hints. Neither of them touches `profiles`, because
// `profiles` belongs to this module (CLAUDE.md's Never rule 2) — they call
// through here.
//
// This module knows nothing about what any id *means*, on purpose. A list of
// valid ids here would be a second place to remember to update, and the failure
// it would prevent — a typo'd id — costs one hint showing forever rather than
// anything a person could not simply dismiss again.

/** Every notice this account has dismissed, as id -> when. */
export async function getDismissedNotices(
  db: SupabaseClient,
  userId: string
): Promise<Record<string, string>> {
  const profile = await repo.findByUserId(db, userId);
  return profile?.dismissed_notices ?? {};
}

/** Has this account put this one away? */
export async function hasDismissed(
  db: SupabaseClient,
  userId: string,
  noticeId: string
): Promise<boolean> {
  return (await getDismissedNotices(db, userId))[noticeId] !== undefined;
}

/**
 * Put one away, or bring it back.
 *
 * Bringing one back matters as much as putting it away: dismissing is not a
 * decision anybody should be stuck with, and `/start` is reachable from settings
 * for exactly that reason.
 */
export async function setDismissed(
  db: SupabaseClient,
  userId: string,
  noticeId: string,
  dismissed: boolean
): Promise<Profile> {
  const notices = { ...(await getDismissedNotices(db, userId)) };

  if (dismissed) notices[noticeId] = new Date().toISOString();
  else delete notices[noticeId];

  return repo.updateDismissedNotices(db, userId, notices);
}
