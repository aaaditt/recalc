// Public API of the profiles module. Import only from here.
//
// Owns `profiles` — one row per account, holding the username that lets one
// person name another. `id` IS the auth.users id; there is no separate key.
//
// The thing to know before using this module: `profiles_select` returns your
// own row and nothing else (migration 013). Looking someone else up goes
// through `lookupByUsername`, which is the only caller of the one
// `security definer` function allowed past that policy — exact match, at most
// one row, never a prefix. There is no search function here, and adding one
// would make every account on the app enumerable.
export {
  claimUsername,
  getProfile,
  hasProfile,
  isOnboardingDismissed,
  isValidUsername,
  lookupByUsername,
  normaliseUsername,
  setDisplayName,
  setOnboardingDismissed,
  usernameProblem,
} from './service';
export {
  ProfileAlreadyExists,
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  UsernameTaken,
  claimUsernameInputSchema,
  foundProfileSchema,
  profileSchema,
  usernameSchema,
  type ClaimUsernameInput,
  type FoundProfile,
  type Profile,
} from './schema';
