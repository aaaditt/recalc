# Handoff — everything outstanding as of 2026-09-08

Written at the end of the session that built slice 18. Delete once slices 19–23
are done and the manual setup below is finished.

---

## Things only Aadit can do — nothing in code fixes these

### 1. The Google credentials in `.env.local` are placeholders

This is why "Connect Drive" fails with `flowName=GeneralOAuthFlow`. Google
never reaches the redirect URI; the real error underneath is
`invalid_client` — "The OAuth client was not found".

```
GOOGLE_CLIENT_ID      37 chars, wrong format   (real ones are ~72)
GOOGLE_CLIENT_SECRET  10 chars, no GOCSPX-     (real ones are 35)
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY   empty
```

`docs/GOOGLE_SETUP.md` is the walkthrough, ~15 minutes. It blocks **three**
features at once: Drive attachment (slice 09), Gmail sync (slices 14–15), and
the "Continue with Google" button on `/login` (slice 18).

### 2. Supabase's Google auth provider is not enabled

`docs/SLICE_18_SETUP.md` §5. Needs step 1 done first, because it reuses the
same client ID and secret.

### 3. Nothing — slices 18 and 19 are green

Slice 18 is committed at `e1710b9`. Slice 19 is built with `npm run check`
passing on all 449 tests and `npm run build` clean. Migration 014 is applied to
the remote database and the backfill has run.

---

## The database is in the wrong hemisphere

Measured, not guessed: **~606ms per round trip** (min 595, max 1618) to
`ap-southeast-2`. A `select id limit 1` on an empty table costs the same as a
real query, so essentially all of it is distance.

What that causes:

- Adding one class to the timetable took **~11 sequential round trips ≈ 6.6s**;
  slice 19 cut it to six and made the screen respond immediately regardless.
- `syllabus-units.test.ts` needs ~54 sequential trips; the test timeouts were
  raised from 30s to 90s in slice 18 because of it.
- Every screen that queries in sequence rather than in a `Promise.all` pays it
  once per query.

Aadit was offered a move to `ap-south-1` (Mumbai) and chose instead to fix it in
code — optimistic UI plus fewer round trips. That was slice 19, and it is done.
**The offer still stands and gets more expensive with every week of real data:**
slice 19 removed four round trips from a save and hid the rest, but six remain
and each still costs ~606ms. A closer database would make all six cheap at once,
and would take `syllabus-units.test.ts` from ~33s to a few seconds.

---

## Build order

One slice per session (`CLAUDE.md`).

Speed went first, ahead of the slice whose design was already written, so that
the guided onboarding path would not have to be walked through at 6.6 seconds a
press. It is done; start at slice 20.

### Slice 19 — Speed — **DONE** (2026-09-08)

Both halves were built, because optimistic UI hides latency and only the
round-trip cuts remove it.

Optimistic UI: `useOptimistic` in `components/timetable/timetable-grid.tsx`, no
new dependency. The sheet closes on submit rather than on the database
answering. An unconfirmed block is drawn faded and is not clickable — its id is
a `pending:` placeholder, not a `sessions.id`.

The rollback: the three class actions now return `SaveResult` instead of
throwing, and a failed save prints one line above the grid naming the day and
period that is unchanged. The block itself is removed by `useOptimistic`
reverting to `props.classes` — which is only correct because `applyPending`
never mutates that array. **That is the slice's invariant and it is the whole of
the promise**; `lib/timetable.test.ts` proves it.

Round trips removed, counted by `modules/timetable/round-trips.test.ts`:

| | before | after |
|---|---|---|
| add a class + a new course | 10 queries | 8 |
| add a class to an existing course | 8 | 6 |
| every signed-in request | +1 (`hasProfile`) | 0 |
| every render of `/timetable` | layout and page both ask | asked once |

- Migration 014 mirrors `has_profile` into `auth.users.raw_app_meta_data` with a
  trigger on `profiles`, and backfills. The proxy reads it off `getUser()` for
  free, and still falls back to the query when the claim is absent.
- `generateMeetings` joins `courses!inner(id)` instead of listing courses and
  then listing sessions on their ids — two sequential trips became one.
- `generateRestOfTerm` takes the workspace the action already read instead of
  fetching the same row by the same id.
- `lib/session.ts` memoises `currentUser` / `currentWorkspace` with React's
  `cache()`, so the shell and the page share one answer.

`refreshed()` still revalidates five paths, deliberately: `/timetable` first is
what makes the fresh grid part of the same POST, which is what lets the
optimistic block hand over without a flicker. Removing it would reintroduce one.

What was **not** done, and is written up under "Noticed, not fixed": ~28 other
screens still open with `getUser()` + `ensureWorkspace()` by hand and would each
be a one-line change to `lib/session.ts`. That is the cheapest ~1.2s left.

### Slice 20 — Onboarding — **NEXT**

**Design: `docs/superpowers/specs/2026-09-08-onboarding-design.md`. Approved.
Read it in full; it records what was rejected and why.**

A guided path at `/start`, one step at a time, that teaches by having the user
do the real thing on the real screen. Two acts split by a prerequisite (Act 2
needs an AI key), every step skippable, progress derived from real data and
never stored. Replaces `components/onboarding/first-run.tsx`.

The trap, and the slice's invariant: step 7's predicate must key on
`blocks.version > 1`, not on "something is stale" — otherwise accepting the diff
in `/review` un-ticks the step at the exact moment the user did the right thing.

### Slice 21 — Just-in-time hints

The other half of what Aadit asked for under "onboarding": each feature explains
itself the first time it becomes useful, rather than being narrated at an empty
screen on day one. One dismissible line, in the neutral palette, in the shape
`components/today/setup-agents.tsx` already uses.

Triggers must read data the screen already has, or this reintroduces the round
trips slice 19 just removed. Storage: a dismissed-ids column on `profiles`.

### Slice 22 — Friends

Schema settled in `docs/SLICES.md` and `docs/SCHEMA.md`. One row per pair with
`least()/greatest()` uniqueness, and **two** directional visibility columns —
what I show you and what you show me are independent choices. Lookup is by exact
username through `find_profile_by_username`; there is no search, deliberately.
`profiles_select` widens to accepted friends here and nowhere else.

### Slice 23 — Compare timetables

**Do not widen `sessions_select`.** `sessions` has no `workspace_id` — it reaches
a workspace only through `courses` — so that policy is three tables deep already
and a mistake in it leaks notes. Use a second `security definer` function that
checks for an accepted friendship, reads the visibility column *for the correct
direction*, and returns times only, or times plus course code and room.

### Not designed — the all-day timetable

Aadit's description: a 12am–12am day that holds named blocks, one of them
"College Timetable" (currently 7:30–3:40), which opens or zooms into the grid
that exists today.

**This needs a brainstorm before a plan.** It changes what `sessions` and
`periods` mean: today they *are* the timetable, and afterwards they would be the
contents of one block inside a day. That touches the data model rather than
sitting on top of it, and `class_meetings` generation depends on it. Do not
start it from a table row.

---

## Noticed, not fixed

The full list is at the bottom of `docs/DECISIONS.md`. The ones that will bite
soonest:

- **`reorderSyllabusUnits` does eight round trips to swap two rows.** At 606ms
  that is ~5s per arrow-press on the course page. Natural companion to slice 19.
- **A note's version does not move when its set of paragraphs changes.** Adding
  or soft-deleting a paragraph stales nothing, because the cascade fires on a
  version bump of a block already on a receipt. This is the biggest hole in the
  sentence the whole product exists to say. Half a day, in `modules/notes` and
  `modules/blocks`.
- **No summary, answer, embedding or extraction has ever been produced by a real
  model.** Every mechanism is proved against the real database with the
  provider's network faked; every *prompt* is guesswork. `vector(1536)` is a
  hard width, so the `embed` role wants OpenAI's `text-embedding-3-small`.
- **One "needs you" surface.** `/review` has a nav column and a badge; `/inbox`
  has neither; a dead Gmail token is invisible outside `/settings/email`.

---

## Context from this session that is not obvious from the code

- **Migration 013 evicted another application from this database.** Eighteen
  tables, twenty-eight functions and a trigger on `auth.users` belonging to a
  trip-planning app were living in the Recalc project, written 28–29 August when
  that app was pointed at the wrong URL. They were never in the migration
  ledger. The trigger had been inserting a row for every Recalc sign-up. Full
  account in `docs/DECISIONS.md`. The lesson worth keeping: a Supabase anon key
  is scoped to a *project*, not an application.
- **Dropping that trigger required a trick.** `DROP TRIGGER` needs ownership of
  the table, and `auth.users` is owned by `supabase_auth_admin` while migrations
  run as `postgres`. Dropping the *function* with `cascade` takes the trigger
  with it, and `postgres` does own the function.
- **Tests must sign in as real users to prove RLS.** The service-role key
  bypasses every policy, so a policy test written with it passes whether the
  policy exists or not. `modules/profiles/username.test.ts` uses the anon key
  and two real sessions, and asserts the positive case before the negative ones
  — otherwise "a prefix finds nobody" would also pass if the function were
  simply broken.
