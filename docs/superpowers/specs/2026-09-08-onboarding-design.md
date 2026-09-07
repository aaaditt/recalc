# Onboarding — a guided path that teaches by doing

Slice 19. Design approved 2026-09-08.

## Why

A new Recalc account has no courses, no timetable, no notes and no AI key. Six
of the app's screens are empty on day one, and the one thing that makes this
product unlike any other notes app — a summary that knows its source changed —
is invisible until several other things have happened first.

Slice 17 shipped a five-step card on `/today` that ticks itself off real data.
It works, but it can only list. It cannot say *why* a course matters, cannot
carry the summarise-edit-stale sequence, and has no room to welcome anybody.

This slice replaces it with a real destination.

## What was decided, and what was rejected

| Decision | Rejected alternative |
|---|---|
| **Teach by doing** — every step is a real action on the real screen, and the app fills with the user's own data as they go | A spotlight/tooltip tour. It reverses three explicit "not a modal, not a wizard" decisions in this codebase, and it would narrate six empty screens |
| **Two acts, split by a prerequisite** — Act 2 needs an AI key | Framing Act 2 as "optional". Every step is optional; the real difference is that Act 2 needs a key the user may not have |
| **One step at a time** (`/start`) | The full checklist. All steps visible is more efficient and less welcoming; "welcoming" is the goal here |
| **Setup only on `/start`** | A step per feature. Search, Review, Focus and Questions cannot be demonstrated with an empty account. They become slice 20's just-in-time hints |
| **No entry in the main nav** | A nav link. `AppNav` renders on every page, so a link would cost a database read per navigation — see "Why there is no nav entry" |

## The steps

Every step is skippable, says so plainly, and can be returned to. Nothing about
this flow blocks the app: `/start` is a place you can leave at any moment, and
no route ever redirects into it. The one screen in this app that blocks is
`/welcome`, and that stays the only one.

### Act 1 — needs nothing but typing

| # | Step | Why line (shown under the title) | Ticked when |
|---|---|---|---|
| 1 | Say when term runs | Two dates. Adding a class then knows how far to expand itself. | `workspace.term_start && workspace.term_end` |
| 2 | Add your first course | Everything hangs off a course — notes, deadlines, the questions you never got round to. | `getCourses(workspaceId).length > 0` |
| 3 | Put it on the timetable | Click the cell where it sits. Your lectures get made for the whole term. | `getSessions(workspaceId).length > 0` |
| 4 | Write your first note | Attached to a lecture, so it knows which class it came from. | `listNotes(workspaceId).length > 0` |

### Act 2 — needs an AI key

Introduced by one line stating the prerequisite honestly: this part needs a key
from a provider, it costs money, and skipping it leaves a working app.

| # | Step | Ticked when |
|---|---|---|
| 5 | Add a model | `hasAgentRole(userId, 'deep')` |
| 6 | Summarise that note | **any** note in the workspace has a `summarize` derivation |
| 7 | Edit it, and watch it go stale | **any** note that has a `summarize` derivation has block `version > 1` |

"That note" in the copy means the one they wrote in step 4, but the predicates
say *any*, deliberately. A user who summarises a different note has still done
the thing the step teaches, and a predicate that insists on one particular block
id would leave them stuck on a step they have already completed.

Each step reports one of three states, not a boolean:

- `done` — the predicate holds
- `todo` — it does not, and the user can act now
- `blocked` — it does not, and a prerequisite is missing (Act 2 with no `deep`
  role). The screen says what is missing instead of offering a dead button.

**Role note:** summarising asks for `deep` (`modules/recalc/recipes/summarize.ts`),
not `fast`. `/today`'s existing agents strip checks `fast`; that inconsistency
predates this slice and is left alone.

## Progress is derived, never stored

No row anywhere records "step 3 is done". Every tick is computed from data that
already exists, which is why the card it replaces cannot lie and why this one
will not either. Deleting your only course un-ticks step 2, correctly.

**Every predicate must be monotonic in normal use.** Step 7 is the only one
where that is not free, and getting it wrong is the trap:

> The obvious predicate is "something is stale". It breaks. The moment the user
> accepts the diff in `/review` — the correct action, the thing the step was
> teaching — the derivation returns to `fresh` and the step un-ticks itself.
> The user is punished for succeeding.
>
> Keying on `blocks.version` instead fixes it permanently. Version only ever
> increases (migration 001), so "the summarised note has reached version 2"
> means "you edited it after summarising" and stays true forever.

This is the invariant the slice's test exists to protect.

## Why there is no nav entry

`components/app-nav.tsx` renders on every page in the signed-in shell. A
`/start` link there means reading onboarding state on every navigation.

This project's database is in `ap-southeast-2` and one round trip measures
~606ms (`docs/DECISIONS.md`). A nav entry would therefore add roughly 600ms to
every page load, permanently, to show a link that matters for two days.

Instead:

- **`/today`** renders one quiet line — *"Finish setting up →"* — in place of
  today's `FirstRun` card. It costs nothing, because `/today` already fetches
  the courses, sessions and workspace those predicates need.
- **Settings** links to `/start` for ever, so it is never lost.
- The line disappears when Act 1 is complete or the user dismisses it.

## Storage — one column, and a bug it fixes

Migration `014_onboarding.sql`:

```sql
alter table profiles add column onboarding_dismissed_at timestamptz;
```

This replaces `FIRST_RUN_COOKIE` (`lib/first-run.ts`), which has an unnoticed
bug: it is a cookie, so dismissing the setup card on a laptop leaves it showing
on the phone. "I am done with this" is a fact about a person, not about a
browser. An account-level column is the fix, and it is now possible because
slice 18 gave every account a `profiles` row.

## Modules

```
modules/onboarding/
  schema.ts   step definitions (id, title, why, href, cta, act) + zod types
  service.ts  getProgress(db, userId, workspaceId) -> Step[] with `done`
              dismiss(db, userId) / isDismissed
  index.ts    the public API
```

It **owns no table.** The dismissal flag lives on `profiles`, so
`modules/profiles/repo.ts` gains the read and write for it — CLAUDE.md's Never
rule 2 (only a module's own repo touches its tables). `modules/onboarding`
reads everything else through other modules' `index.ts` files, never their
internals (Never rule 1).

**One addition needed elsewhere:** step 6 asks "does a `summarize` derivation
exist in this workspace", and `modules/recalc` currently exposes only
`getNoteSummary(noteBlockId)` and `getReviewQueue`. It needs a small
workspace-level count. That is a required addition for this slice, not a
refactor of code outside it.

## Screens

- `app/start/page.tsx` — server component. Reads progress, renders the current
  step. Sits **inside** the `(app)` group so it keeps the nav; a person mid-tour
  should be able to leave.
- `app/start/actions.ts` — `skipStepAction`, `dismissOnboardingAction`.
- `components/onboarding/guided-step.tsx` — presentational: the progress rail,
  the step title, the why line, the CTA, "Skip this", and the "Next: …" hint.
  Booleans and strings in, no data fetching, like every other component here.
- `components/onboarding/finish-setup-line.tsx` — the one-line replacement for
  the card on `/today`.
- `components/onboarding/first-run.tsx` — **deleted**, superseded.

Design comes from `docs/DESIGN.md`: neutrals only, no accent (not yet having
typed a timetable in is not an alarm), 6px card radius, 32px buttons, and it has
to work one-handed on a phone.

## Testing

`modules/onboarding/progress.test.ts`, against the real database:

1. **THE INVARIANT — accepting a stale summary in `/review` does not un-tick
   step 7.** Summarise a note, edit it, confirm step 7 ticks, accept the diff,
   confirm step 7 is *still* ticked. This is the whole reason the predicate is
   `version > 1` rather than `status = 'stale'`.
2. Each Act 1 step ticks only when its real data appears, and un-ticks if that
   data is removed.
3. Act 2's steps report `blocked` — not `done`, not `todo` — when no `deep` role
   is configured, so the screen can say why rather than showing a dead button.
4. Dismissal is per account: dismissing as one user leaves another user's
   progress untouched, and it survives with no cookies present.

## Out of scope

- **Just-in-time feature hints** (Search, Review, Focus, Questions, Tasks) —
  slice 20. Separate storage, separate trigger predicates, and folding them in
  would double this slice.
- Friends and timetable comparison shift to slices 21 and 22.
- Nothing here touches the staleness engine, and
  `modules/recalc/staleness.test.ts` must still pass untouched.
