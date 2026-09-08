// Public API of the friends module. Import only from here.
//
// Owns `friendships` — one row per pair, unique on `least()/greatest()` of the
// two ids so that (a,b) and (b,a) are the same friendship however it was asked.
//
// **This is the first table in the project that lets one person see another
// person's data**, so read migration 017 before changing anything here. The
// rules that matter are in the database, because the anon key ships to the
// browser: who may accept, which of the two `*_shares` columns each side owns,
// that the two people never change, and that a pair exists once.
//
// Two things this module deliberately does not have:
//
//   * **A search.** You add somebody by typing their exact username, through
//     `modules/profiles`' `lookupByUsername`. A lookup permissive enough to find
//     `@aadit` from `aad` is permissive enough to enumerate every account.
//
//   * **A widened `profiles_select`.** docs/SCHEMA.md said this slice would
//     widen it to accepted friends; it does not. A policy is row-level, so
//     widening `select` on `profiles` hands a friend every column on the row —
//     including slice 21's `dismissed_notices`, and including every column added
//     later. `my_friendships()` names the three fields another person may see.
export {
  acceptRequest,
  getFriends,
  removeFriendship,
  sendRequest,
  setShareLevel,
  whatTheyShow,
} from './service';
export {
  AlreadyAsked,
  AlreadyFriends,
  NoSuchUser,
  SHARE_LEVELS,
  TheyAskedYou,
  directionSchema,
  friendshipSchema,
  friendshipStatusSchema,
  shareLevelSchema,
  type Direction,
  type FriendLists,
  type Friendship,
  type FriendshipStatus,
  type ShareLevel,
} from './schema';
