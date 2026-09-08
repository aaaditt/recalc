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

### 3. Nothing — slices 18 to 22 are green

Slice 18 is at `e1710b9`, 19 at `a5df597`, 20 at `d527191`, 21 at `10982a7`.
Slice 22 is built with `npm run check` passing on all 502 tests and
`npm run build` clean. Migrations 014 to 017 are applied to the remote database
and every backfill has run.

**Worth doing by hand once:** `/friends` cannot be tried alone. It needs a second
account — sign up with another email in a private window, claim a username there,
and add it from your own. That is also the only way to see the two share levels
behave independently, which is the thing the slice exists to get right.

**Worth doing by hand once:** open `/start` and walk it. Steps 1–4 can be done
for real. Steps 6 and 7 cannot be finished without an AI key, and they will
correctly say `blocked` until one is in `/settings/agents` — which is the same
key `docs/GOOGLE_SETUP.md` does *not* unblock, and is a separate ~2 minutes at
`/settings/agents` with an Anthropic or OpenAI key.

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
press. Slices 19 to 22 are done; start at slice 23.

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

### Slice 20 — Onboarding — **DONE** (2026-09-08)

`/start`: seven steps in two acts, one at a time, each one a real action on a
real screen. Progress is derived on every render and stored nowhere. The module
owns no table. `components/onboarding/first-run.tsx`, `lib/first-run.ts` and
`app/(app)/(narrow)/today/actions.ts` are deleted.

**Two deviations from the design, both in `docs/DECISIONS.md`.**

**1. The migration is 015, not 014.** Slice 19 was built first and took 014. The
design document still says 014; the ledger is what ran.

**2. Step 7 keys on `derivations.stale_runs`, not on `blocks.version > 1`.**
This is the important one. The design named one trap in step 7 and there was a
second one underneath it:

> `blocks.version > 1` is already true **before** anything is summarised. The
> note editor autosaves a second after the last keystroke
> (`components/notes/note-editor.tsx`) and `updateBlock` bumps the version
> whenever the content hash moves, so a note written in two sittings reaches
> version 2 on its own. Measured: a paragraph typed, paused over and continued
> came back at version 2 with no summary in existence. Step 7 would have ticked
> alongside step 6 and the guided path would have silently skipped the one
> lesson this product exists to teach.

The two other no-migration candidates fail for the design's own stated reason —
`status = 'stale'` un-ticks on accept, and `derivation_sources.source_version`
is reset by `replaceSources`, which both `acceptPreview` and `keepOldVersion`
call. So migration 015 adds `derivations.stale_runs`, incremented by
`mark_derivations_stale()` on the fresh→stale transition and by nothing else.
It only ever increases and nothing in `/review` touches it.

**That trigger is the product**, so it was replaced with one line added inside
the existing `where d.status = 'fresh'` guard — which is also what makes the
number a count of *transitions* rather than of statements — and the four
staleness suites (31 tests) were run against it before anything else was built.

`modules/onboarding/progress.test.ts` has 15 tests. Two matter most: step 7
stays ticked after `keepOldVersion` resolves the stale summary in `/review`
(THE invariant), and step 7 does **not** tick merely because the note was typed
in two sittings (the regression guard for the bug above).

Also here: skipping a step is `/start?step=<id>` rather than a stored flag;
`/start` has no nav entry (a link in `AppNav` would read onboarding state on
every navigation, ~606ms each) and is reached from one line on `/today` while
Act 1 is unfinished, plus a permanent link on `/settings/semester`.

### Slice 21 — Just-in-time hints — **DONE** (2026-09-08)

Five hints, one per screen, each one line in the neutral palette in the shape
`components/today/setup-agents.tsx` already used, each dismissible for ever.

| Hint | Screen | Fires when | Link |
|---|---|---|---|
| what `/review` is | the app shell | anything is stale | `/review` |
| search reads inside notes | `/notes` | 5+ notes | `/search` |
| an answer carries a receipt | `/notes/[id]` | the note has a body | none |
| a session logs against a unit | `/courses/[id]` | the syllabus has units | `/focus` |
| the deadline shorthand | `/tasks` | a course exists | none |

**Every predicate is a pure function** of facts the screen had already fetched —
`staleCount` was read for the nav badge, `notes` to draw the list, `units` to
draw the syllabus. Six hints each asking the database whether to speak would
have been six round trips at ~606ms, on an app that spent slice 19 removing
four. `modules/hints/hints.test.ts` proves the rules with no database and no
browser in the room.

The one impure part — which hints are dismissed — rides down with
`currentWorkspace()` in `lib/session.ts`, fetched in parallel with the workspace
(both need `user.id`, neither needs the other) and memoised, so it adds no
waiting anywhere.

**Migration 016 replaces slice 20's column.** `profiles.dismissed_notices jsonb`
is a map of notice id -> when it was dismissed; `onboarding_dismissed_at` was
backfilled into it as the id `setup` and dropped. Two mechanisms for "I have
seen this" was one more than the idea deserved, and it was one commit old.

Two of the five hints have no link, and one of those is a bug that was caught
rather than a preference: **`/questions` is not a route** — there is an
`app/(app)/(narrow)/questions/actions.ts` and no `page.tsx`, and questions render
on the note and course pages instead. The hint would have shipped a dead link.
`href`/`cta` are optional on a `Hint` now, and a test asserts that every href
which does exist is a real route.

### Slice 22 — Friends — **DONE** (2026-09-08)

`/friends`: add by exact username, accept or decline, and choose per friend
between `none`, `busy` (times only) and `full` (times, course code and room).
One row per pair, unique on `least()/greatest()` so (a,b) and (b,a) collide.

**One thing in the plan changed, and slice 23 needs to know.** The plan said
`profiles_select` widens to accepted friends. **It does not.** Slice 21 added
`profiles.dismissed_notices`, and a policy is row-level — widening `select`
hands a friend the whole row, every column today and every column added later.
Reading another person goes through `my_friendships()`, a `security definer`
function that names the three fields they may see, exactly like
`find_profile_by_username`. Slice 23 should copy that shape, not the old note.

**What each side shares is enforced by a trigger, not a policy.** Both share
levels live on the one row, so `friendships_update` has to let either party
write it; `friendships_guard` is what says each side may only change their own
column. Same for "only the person asked can accept", "the two people never
change", and "status only goes pending → accepted". A policy cannot say any of
those, because a policy is about rows and all four are about columns and values.

**The tests use three real signed-in sessions on the anon key.** The guard reads
`auth.uid()`, which is null for the service role, so none of its rules fire for
it — which is right (service role bypasses RLS by design) and is why a
service-role test here would prove nothing. Slice 18's lesson, applied.

There is no `declined` status: refusing deletes the row, so declining,
cancelling and unfriending are one act. Nothing is kept, so the same pair can
start again.

`/friends` has no nav entry — the nav is full at six columns — and is linked from
the `/timetable` header and from `/settings/semester`.

### Slice 23 — Compare timetables — **NEXT**

**Do not widen `sessions_select`.** `sessions` has no `workspace_id` — it reaches
a workspace only through `courses` — so that policy is three tables deep already
and a mistake in it leaks notes. Use a second `security definer` function that
checks for an accepted friendship, reads the visibility column *for the correct
direction*, and returns times only, or times plus course code and room.

Slice 22 left two things pointed at this one. `modules/friends` exports
`whatTheyShow(friendship)`, which returns `they_share` and exists so there is one
place to be right about the direction rather than a `case` in slice 23. And the
levels are already named and described in `SHARE_LEVELS`: `none`, `busy` (times
only) and `full` (times, course code and room), which is exactly the two shapes
this slice has to return plus the case where it returns nothing.

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
