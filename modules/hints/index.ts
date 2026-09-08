// Public API of the hints module. Import only from here.
//
// Just-in-time hints — slice 21. One dismissible line per screen, shown the
// first time the feature it describes becomes useful, and never again once it is
// dismissed.
//
// **It owns no table**, like `modules/onboarding`. Dismissals live in
// `profiles.dismissed_notices` (migration 016) alongside the guided path's own
// `setup` id, and are read and written through `modules/profiles`.
//
// **Every predicate is pure.** `hintFor(place, facts, dismissed)` takes what the
// screen already fetched and returns a line or null. Nothing in this module asks
// the database whether it should speak — which is the only way six hints across
// six screens do not become six round trips at ~606ms each. See
// `modules/hints/hints.test.ts`.
export { dismissHint, hintFor, restoreHint, visibleHints } from './service';
export {
  HINTS,
  hintIdSchema,
  hintPlaceSchema,
  type Hint,
  type HintFacts,
  type HintId,
  type HintPlace,
} from './schema';
