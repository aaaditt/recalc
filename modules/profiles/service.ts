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

/**
 * Put the guided setup path away, or bring it back.
 *
 * `modules/onboarding` owns the steps but owns no table, so this pair lives
 * here: `profiles` belongs to this module and CLAUDE.md's Never rule 2 says only
 * a module's own repo touches its tables.
 */
export async function setOnboardingDismissed(
  db: SupabaseClient,
  userId: string,
  dismissed: boolean
): Promise<Profile> {
  return repo.updateOnboardingDismissed(
    db,
    userId,
    dismissed ? new Date().toISOString() : null
  );
}

/**
 * Has this account put the setup path away?
 *
 * False for an account with no profile at all. That state lasts exactly one page
 * load — the one between signing in for the first time and the welcome screen —
 * and "they have not dismissed it" is the truthful answer during it.
 */
export async function isOnboardingDismissed(
  db: SupabaseClient,
  userId: string
): Promise<boolean> {
  const profile = await repo.findByUserId(db, userId);
  return profile?.onboarding_dismissed_at != null;
}
