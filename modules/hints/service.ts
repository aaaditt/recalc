import type { SupabaseClient } from '@supabase/supabase-js';

import { setDismissed } from '@/modules/profiles';

import { HINTS, type Hint, type HintFacts, type HintId, type HintPlace } from './schema';

// Which hint, if any, this screen should show.
//
// **The whole of this decision is a pure function**, and that is the slice's
// point rather than a stylistic preference. Two things follow from it:
//
//   1. No round trips. A hint costs nothing to decide, because everything it is
//      decided from was already on the page. Slice 19 removed four round trips
//      from one save; a hint system that asked the database a question per screen
//      would have quietly put six back.
//
//   2. It is testable without a browser or a database. This project's test
//      runner collects `lib/**` and `modules/**` and has no jsdom in it, so a
//      rule that lives in a component is a rule with no test.
//
// The one thing that is not pure is which hints have been dismissed, and even
// that is not fetched here: it comes down with the session in `lib/session.ts`,
// in parallel with the workspace, so it is free on every screen that already
// renders inside the app shell.

/**
 * The hint for this place, or null.
 *
 * Null is by far the most common answer and is not a failure: most screens, most
 * of the time, have nothing to say. A hint that is dismissed, or whose feature is
 * not useful yet, is simply not there.
 */
export function hintFor(
  place: HintPlace,
  facts: HintFacts,
  dismissed: Readonly<Record<string, string>>
): Hint | null {
  const found = HINTS.find((hint) => hint.place === place);
  if (!found) return null;
  if (dismissed[found.id] !== undefined) return null;
  if (!found.useful(facts)) return null;
  return copy(found);
}

/**
 * The line, without the predicate that decided to show it.
 *
 * The two travel together in `HINTS` because they are one product decision, but
 * the caller has no use for the second — and a component that could call
 * `useful()` is a component that could disagree with this module about when to
 * speak. Written out field by field rather than as a rest-destructure so there
 * is nothing to discard and nothing to name in order to discard it.
 */
function copy(hint: (typeof HINTS)[number]): Hint {
  return {
    id: hint.id,
    place: hint.place,
    text: hint.text,
    ...(hint.href ? { href: hint.href } : {}),
    ...(hint.cta ? { cta: hint.cta } : {}),
  };
}

/** Every hint that would show right now, given everything. For tests, and /start. */
export function visibleHints(
  facts: HintFacts,
  dismissed: Readonly<Record<string, string>>
): Hint[] {
  return HINTS.filter(
    (hint) => dismissed[hint.id] === undefined && hint.useful(facts)
  ).map(copy);
}

/**
 * Put one away, for ever.
 *
 * The only thing in this module that writes, and it writes through
 * `modules/profiles` because `profiles` is that module's table — CLAUDE.md's
 * Never rule 2. `modules/hints` owns no table at all.
 */
export async function dismissHint(
  db: SupabaseClient,
  userId: string,
  id: HintId
): Promise<void> {
  await setDismissed(db, userId, id, true);
}

/** And bring it back, which nothing in the UI does yet but a person may ask for. */
export async function restoreHint(
  db: SupabaseClient,
  userId: string,
  id: HintId
): Promise<void> {
  await setDismissed(db, userId, id, false);
}
