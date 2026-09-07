import { z } from 'zod';

// docs/SCHEMA.md, "Profiles":
//
//   profiles (id, username, display_name, created_at, updated_at)
//            -- id IS the auth.users id, not a fresh uuid
//            -- username is unique case-insensitively, via a functional index
//
// The first table in this project about a *person*. Everything before slice 18
// belonged to a workspace, and a workspace belonged to an anonymous auth.users
// row that nothing ever had to name. A friends list cannot work that way.

// ---------------------------------------------------------------------------
// Usernames
// ---------------------------------------------------------------------------

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/**
 * Words a username may not be.
 *
 * Two reasons, and only the first is about today. A username shows up in
 * sentences the app writes — "@today added you" reads as a bug — and slice 19
 * has to render it beside a request. The second is that `/@username` is the
 * obvious profile URL to add later, and every one of these is already a route
 * segment in `/app`. Giving one away now means either breaking that URL or
 * taking someone's name off them, and neither is a thing to do to a person.
 *
 * Kept here rather than in the migration's check constraint on purpose: "that
 * word is a route" is a fact about the app, which changes when the app does.
 * The database's job is the shape of the string, not the app's URL map.
 */
export const RESERVED_USERNAMES = new Set([
  // Routes that exist today.
  'api',
  'auth',
  'calendar',
  'courses',
  'focus',
  'inbox',
  'lecture',
  'login',
  'notes',
  'questions',
  'review',
  'search',
  'settings',
  'styleguide',
  'tasks',
  'timetable',
  'today',
  'welcome',
  // Routes slices 19 and 20 will want.
  'friends',
  'me',
  'profile',
  'compare',
  // Things that read as the app speaking rather than a person.
  'admin',
  'help',
  'new',
  'null',
  'recalc',
  'root',
  'support',
  'system',
  'undefined',
]);

/**
 * A username as typed, turned into a username as stored.
 *
 * Lowercasing here rather than at the database is what makes `Aadit` and
 * `aadit` the same name everywhere in the app, not only in the unique index.
 * The index is still case-insensitive — see migration 013 — because a rule
 * enforced in one place is a rule that holds until someone writes a second
 * caller.
 */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The rules, in the order a person hits them.
 *
 * Order matters: zod reports the first refinement that fails, and "too short"
 * is a more useful thing to be told than "letters, numbers and underscores
 * only" when you typed two letters.
 */
export const usernameSchema = z
  .string()
  .transform(normaliseUsername)
  .refine((name) => name.length >= USERNAME_MIN_LENGTH, {
    message: `Usernames are at least ${USERNAME_MIN_LENGTH} characters.`,
  })
  .refine((name) => name.length <= USERNAME_MAX_LENGTH, {
    message: `Usernames are at most ${USERNAME_MAX_LENGTH} characters.`,
  })
  .refine((name) => /^[a-z0-9_]+$/.test(name), {
    message: 'Letters, numbers and underscores only — no spaces.',
  })
  .refine((name) => !RESERVED_USERNAMES.has(name), {
    message: 'That one is taken by the app itself. Pick another.',
  });

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  display_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * What one person is allowed to know about another.
 *
 * The same three fields `find_profile_by_username` returns, and deliberately
 * not `created_at` — when someone joined is nobody else's business, and a
 * shape that cannot carry it cannot leak it by accident later.
 */
export const foundProfileSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  display_name: z.string().nullable(),
});

export type Profile = z.infer<typeof profileSchema>;
export type FoundProfile = z.infer<typeof foundProfileSchema>;

/** What the welcome screen posts. */
export const claimUsernameInputSchema = z.object({
  userId: z.uuid(),
  username: usernameSchema,
  // Optional, and blank means "no display name" rather than an empty string —
  // a null renders as the username, an empty string renders as nothing.
  displayName: z
    .string()
    .trim()
    .max(60, 'That is longer than a name needs to be.')
    .optional()
    .transform((value) => (value && value !== '' ? value : null)),
});

/**
 * What a caller passes in, not what comes out.
 *
 * `z.infer` would be the *parsed* shape — username already lowercased,
 * displayName already turned into `string | null` — which would oblige every
 * caller to do the schema's own job before calling it. `z.input` is the shape
 * of the form: a raw username, and a display name that may simply be absent.
 */
export type ClaimUsernameInput = z.input<typeof claimUsernameInputSchema>;

/** The row-shaped version, after parsing. Used inside the service only. */
export type ClaimUsernameParsed = z.output<typeof claimUsernameInputSchema>;

// ---------------------------------------------------------------------------
// Errors a caller catches by type
// ---------------------------------------------------------------------------

/**
 * Somebody already has it.
 *
 * Thrown from the `23505` unique violation on `profiles_username_key` rather
 * than from a "select first, then insert" check — two people claiming the same
 * name in the same second is exactly when a pre-check is wrong, and the index
 * is the only thing that cannot race. Modelled on `AgentNotConfigured` in
 * modules/agents/schema.ts: a type to catch, not a string to match.
 */
export class UsernameTaken extends Error {
  readonly username: string;

  constructor(username: string) {
    super(`@${username} is already taken. Try another.`);
    this.name = 'UsernameTaken';
    this.username = username;
  }
}

/**
 * This account already has a username.
 *
 * A username is claimed once. Changing it is a real feature — it breaks other
 * people's memory of who you are and, once slice 19 lands, the name on a
 * pending request — and it is not this slice's.
 */
export class ProfileAlreadyExists extends Error {
  constructor() {
    super('This account already has a username.');
    this.name = 'ProfileAlreadyExists';
  }
}
