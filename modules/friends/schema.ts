import { z } from 'zod';

// Friends — slice 22.
//
// docs/SCHEMA.md, and migration 017:
//
//   friendships (id, requester_id, addressee_id, status,
//                requester_shares, addressee_shares, created_at, updated_at)
//     -- one row per pair, unique on least()/greatest() of the two ids
//     -- two directional visibility columns: what I show you and what you show
//        me are independent choices
//
// This is the first table in the project that lets one person see another
// person's data, so almost everything true about it is true in SQL rather than
// here. What this module adds on top is the vocabulary and the refusals that are
// nicer to make in TypeScript than in a constraint.

/**
 * How much of your week one friend can see.
 *
 * Three levels, and the gap between the first two is the one that matters:
 * `busy` says *when* you are in a class and nothing about which, so it is enough
 * to find a shared free hour without telling anyone what you study.
 */
export const shareLevelSchema = z.enum(['none', 'busy', 'full']);
export type ShareLevel = z.infer<typeof shareLevelSchema>;

/** What each level actually discloses, for a screen that has to say so plainly. */
export const SHARE_LEVELS: { value: ShareLevel; label: string; detail: string }[] = [
  { value: 'none', label: 'Nothing', detail: 'They see none of your week.' },
  {
    value: 'busy',
    label: 'Free or busy',
    detail: 'They see when you are in a class, but not which one.',
  },
  {
    value: 'full',
    label: 'Course and room',
    detail: 'They also see the course code and where it is.',
  },
];

export const friendshipStatusSchema = z.enum(['pending', 'accepted']);
export type FriendshipStatus = z.infer<typeof friendshipStatusSchema>;

/**
 * Which way a request was sent.
 *
 * Named from the caller's point of view rather than by column, because every
 * bug available in this table is a bug about reading the wrong side.
 */
export const directionSchema = z.enum(['incoming', 'outgoing']);
export type Direction = z.infer<typeof directionSchema>;

/**
 * One friendship, as the person looking at it sees it.
 *
 * This is the shape `my_friendships()` returns, and it is deliberately not the
 * shape of the table: there is no `requester_id` here to get the wrong way
 * round. There is the other person, which way the request went, what I show them
 * and what they show me.
 */
export const friendshipSchema = z.object({
  id: z.uuid(),
  other_id: z.uuid(),
  other_username: z.string(),
  other_display_name: z.string().nullable(),
  status: friendshipStatusSchema,
  direction: directionSchema,
  /** What I show them. Mine to change. */
  i_share: shareLevelSchema,
  /** What they show me. Theirs, and read-only from here. */
  they_share: shareLevelSchema,
  created_at: z.string(),
});
export type Friendship = z.infer<typeof friendshipSchema>;

/** Everything the friends screen draws, in the three groups it draws them in. */
export type FriendLists = {
  /** Accepted, both ways. */
  friends: Friendship[];
  /** They asked me, and I have not answered. The only group with buttons. */
  incoming: Friendship[];
  /** I asked them, and they have not answered. */
  outgoing: Friendship[];
};

/**
 * Why a request could not be sent, in a sentence.
 *
 * A type rather than a string per failure, because the screen says different
 * things for each and matching on a message is how those drift apart.
 */
export class NoSuchUser extends Error {
  constructor(username: string) {
    super(`Nobody here is called @${username}.`);
    this.name = 'NoSuchUser';
  }
}

export class AlreadyFriends extends Error {
  constructor(username: string) {
    super(`You and @${username} are already friends.`);
    this.name = 'AlreadyFriends';
  }
}

export class AlreadyAsked extends Error {
  constructor(username: string) {
    super(`You have already asked @${username}. They have not answered yet.`);
    this.name = 'AlreadyAsked';
  }
}

export class TheyAskedYou extends Error {
  constructor(username: string) {
    super(`@${username} has already asked you — their request is waiting below.`);
    this.name = 'TheyAskedYou';
  }
}

// ---------------------------------------------------------------------------
// Comparing timetables — slice 23
// ---------------------------------------------------------------------------

/**
 * One class in a friend's week, as much of it as they let you see.
 *
 * `course_code` and `room` are null at the `busy` level and populated at `full`.
 * They are *null* rather than absent on purpose: the shape is the same at every
 * level, so nothing downstream can tell the levels apart by which fields came
 * back, and nothing can read a code that happened to be there.
 */
export const friendClassSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  starts_at: z.string(),
  ends_at: z.string(),
  course_code: z.string().nullable(),
  room: z.string().nullable(),
});
export type FriendClass = z.infer<typeof friendClassSchema>;
