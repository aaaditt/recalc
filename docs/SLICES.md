# Build order

One slice per session. Each ends with something that works. Update the status
column as you go — this is how a fresh session knows where we are.

| # | Slice | Status |
|---|---|---|
| 00 | Foundation — Next.js, Supabase, auth, blocks + engine tables | done |
| 01 | Semester data — courses, sessions, meetings, units, tasks (no UI) | done |
| 02 | Design system — tokens, fonts, course colours, primitives | done |
| 03 | Today — the daily page | done |
| 04 | **Calendar** — week / day / month, meeting generation | done |
| 05 | Notes + lecture pages — TipTap over blocks | done |
| 06 | Tasks — CRUD, linked to courses, units and lectures | done |
| 07 | Focus — Pomodoro logged against a syllabus unit | done |
| 08 | Syllabus — ordered units, status, progress | done |
| 09 | Google Drive — connect, picker, attach files to lectures | done |
| 10 | Agents — BYOK settings, encrypted keys, role registry | done |
| 11 | **Recalc engine** — derivations, first recipe, /review queue | done |
| 12 | **Questions** — ask-about-selection, open questions per course | done |
| 13 | Search — pgvector over versioned embeddings | done |
| 14 | Email connect — Gmail OAuth, incremental sync | done |
| 15 | Email extraction — proposals queue | done |
| 16 | **Timetable** — the period grid, click a cell to add or edit a class | done |
| 17 | **Semester setup** — first-run steps, course settings, syllabus editing, period editor | done |
| 18 | **Identity** — usernames, the welcome gate, Google sign-in | done |
| 19 | **Speed** — optimistic UI, and fewer round trips per save | done |
| 20 | **Onboarding** — `/start`, a guided path that teaches by doing | done |
| 21 | Just-in-time hints — a feature explains itself when it becomes useful | done |
| 22 | Friends — requests, accept/decline, per-friend visibility | done |
| 23 | Compare — one friend's free/busy or detail, beside yours | done |
| 24 | **Account** — a password, a sign-out, and a settings page that exists | done |
| ?? | All-day timetable — a 12am–12am day holding named blocks | **not designed** |

Slice 20's design is at
`docs/superpowers/specs/2026-09-08-onboarding-design.md`. It is built, with two
deviations recorded in `docs/DECISIONS.md`: the migration is 015 rather than 014
(slice 19 took 014), and step 7 keys on `derivations.stale_runs` rather than on
`blocks.version > 1`, because the version predicate was measured to be true
*before* anything is summarised — the editor autosaves and a note written in two
sittings is at version 2 on its own. It would have ticked itself and skipped the
lesson.

Speed came first, ahead of the slice whose design is already written, on
purpose. It was the one thing wrong with this app that got noticed every single
day — adding a class took about 6.6 seconds — and building a guided onboarding
path on top of that would have meant testing every step of it at 6.6 seconds a
press. Slice 19 is done: the grid draws the class immediately, and the save
behind it went from ten queries to eight (a new course) or from eight to six (an
existing one), with one more removed from every signed-in request in the app.
`modules/timetable/round-trips.test.ts` counts them so they cannot creep back.

Slices 22 and 23 are built, and both ended up narrower than the plan for the
same reason. `profiles_select` was **not** widened to accepted friends (slice 21
put `dismissed_notices` on that table, and a row-level policy would have handed a
friend every column), and `sessions_select` was **not** widened either. Reading
another person goes through two `security definer` functions that name their
columns: `my_friendships()` and `friend_timetable()`.

Slice 24 was not on the original plan and was found by using the app: there was
no way to **sign out** — no button and no route, in twenty-three slices — and
`/settings` was a 404, with its five screens reachable only through each other's
headers. It adds a password as a third way in, a `/settings` index, and
`/settings/account`.

**Every slice on this list is now done.** What comes next is in "What to build
next" below, and the all-day timetable still needs a brainstorm before a plan.

The all-day timetable has neither. It is the one item here that changes what
`sessions` and `periods` *mean* — a day would become a container of blocks, one
of which is the college timetable that currently owns the whole screen — so it
needs a brainstorm before it needs a plan. Do not start it from this table row.

## Why this order

- **01 before everything visual** so the app renders real data from day one, never fixtures.
- **02 before any screen.** Sixteen sessions of UI built without shared tokens will
  look like sixteen different apps. This slice is thirty minutes and saves a rewrite.
- **04 early** because the semester has already started and the calendar is the thing
  being used on day one.
- **05 after 04** because a lecture note needs a lecture to hang off.
- **09 before 14** because Drive's `drive.file` scope is non-sensitive and much
  simpler than Gmail's restricted scope — and files matter more day to day than email.
- **10 before 11** because the engine needs a model to call.
- **11 and 12 are the product.** Everything before them is groundwork.
- **14 and 15 last** — most fragile, least payoff per hour.

Slice 09 needs one thing done by hand before its definition of done can be
checked: a Google Cloud project, an OAuth client and a Picker API key.
`docs/GOOGLE_SETUP.md` has the exact steps. Everything in the app renders and
works without it — Drive attachment is what is missing until it is done.

Slice 10 needs the same kind of thing: a real Anthropic, Google or OpenAI API
key pasted into `/settings/agents`. Every screen renders and every test passes
without one, but "Test connection" has never been run against a live provider —
see the last entry under "Noticed, not fixed" in `docs/DECISIONS.md`.

Slice 11 needs that same key, and needs it more: the engine is built, proved
against the real database and the real cascade, and driven end to end by tests
over the AI SDK's own mock model — but **no summary in this project has ever
been written by a real model**. Every status transition, every receipt and
every screen works without one; what is unverified is whether the summaries a
live provider returns are any good. Paste a key into `/settings/agents` and
press Summarise on a note.

Slice 12 inherits exactly that gap and nothing else. The lifecycle, the
anchoring, the receipt, the cascade through `derivation_sources` and the course
page's sentence are all proved against the real database
(`modules/recalc/answer-staleness.test.ts`, `lib/questions.test.ts`), with only
the provider's network faked — but **no answer in this project has ever been
written by a real model either**. Same key, same fix: paste one in and press
Answer on a question.

Slice 13 works *without* that key, which is the difference. Search's full-text
half reads live blocks, so `/search` finds anything you have written the moment
you have written it and stops finding the old wording the moment you change it —
no model involved. The semantic half needs the `embed` role filled in
`/settings/agents`; until it is, the screen says so in one line and searches
words alone. What is proved against the real database, with only the provider's
network faked, is the invariant itself: an embedding whose version is behind its
block's stays physically in the table and cannot be reached by any query path
(`modules/search/search-staleness.test.ts`). What is unproved is whether a real
provider's vectors rank anything sensibly — and note that `vector(1536)` is a
hard width, so the `embed` role wants OpenAI's `text-embedding-3-small` rather
than a Gemini model, which returns 768. See `docs/DECISIONS.md`.

Slice 14 needs the same one-off Google setup slice 09 did, plus one thing more:
the OAuth consent screen has to list `gmail.readonly` (SETUP.md section 3, point
6) and it has to be **in production, not testing** — an app left in testing
issues refresh tokens that die after seven days, which is exactly the failure
this slice spends its effort making survivable. **No Gmail account has ever been
connected on this machine**, so nothing past the consent screen has been seen
working for real. What *is* proved against the real database, with only Google's
network faked (`modules/gmail/incremental-sync.test.ts`, 10 tests): the first
sync pulling a bounded 30-day window and giving every message an `email` block;
the second sync calling `history.list` from the stored cursor and **never
touching the mailbox listing endpoint again**; a too-old history id falling back
to a bounded re-sync and logging it without a word of anyone's mail in the log
line; a revoked refresh token setting `status = 'needs_reconnect'` and returning
rather than throwing; and the same message arriving twice duplicating neither the
row nor its block. `modules/google/gmail-scope.test.ts` proves the URL this app
sends a browser to asks for `gmail.readonly` and nothing that could send, label
or delete. Connect an account on `/settings/email` and press **Sync now** twice.

Slice 15 needs both of the things slice 14 needs — a Gmail account past the
consent screen — and the provider key slices 10–13 have been waiting for, in
the `deep` role. Without either, `/inbox` renders, says nothing is waiting, and
the Scan button truthfully reports there is no mail to read. **No real email has
ever been read by a real model on this machine**, so the wording in
`modules/recalc/recipes/extract.ts` is unproved: whether a subject line and a
snippet are enough for a model to find a deadline, and how often it invents one.
What *is* proved against the real database with only the provider's network
faked (`modules/proposals/email-proposals.test.ts`, 12 tests): a scan of a
mailbox holding one course email and one society newsletter spending **exactly
one** model call, three rows landing in `email_proposals` with status
`proposed`, the `tasks` table and the lecture's status *both untouched* while
they sit there, accepting a deadline creating exactly one task and flipping the
row to `accepted`, accepting a class change cancelling the lecture and creating
no task, rejecting keeping the row for ever, and re-running extraction over that
same email — model called again, same three items returned — proposing nothing
at all, because the unique index on `(email_id, fingerprint)` in migration 011
is what enforces it rather than a check some future caller could forget. The
gate, the quote check and the fingerprint are proved again without a database in
`modules/proposals/extraction-safety.test.ts` (11 tests). `/inbox` is reached
from **Settings → Email → Inbox**: the nav is six columns and full.

Slice 17 needs nothing at all — no key, no Google account, no one-off setup.
It finishes what 16 started: **a whole semester can now be set up and run from
inside the app**, and `docs/SEEDING.md` describes that flow rather than a trip
to the Supabase table editor. Signed in with an empty database, `/today` shows
three steps (term dates → courses → timetable) which tick themselves off and
vanish once there is a course and a term. `/courses` adds and lists courses;
`/courses/<id>/settings` edits a course's code, name, colour, instructor,
credits and term, and is the only place a course can be deleted;
`/courses/<id>` gained a remove button per syllabus unit; `/timetable/periods`
edits the nine seeded rows, adds the spare `+1` from `last_sem.jpeg`, and
removes a row.

The dangerous part of the slice is the period editor, and the whole of it is
proved against the real database in `modules/timetable/period-edits.test.ts`
(8 tests). **Editing a period moves no lecture that already exists** — same
ids, same instants, note still attached — because `sessions.starts_at` is
authoritative and the period's times were copied into the session at add-time
(slice 16's decision, deliberately kept). A class added *after* the edit gets
the new times. Moving the classes already on a row is a second, explicit press
which even then only moves future untouched lectures. And deleting a course is
refused while any note, file, task or hand-edited lecture belongs to it, because
`courses` cascades to `class_meetings` and a lecture is what a note hangs off.

## If you run out of steam

Slices 00–09 give you a genuinely good semester planner. Slices 11 and 12 are the
part that does not exist anywhere else. If time gets tight, skip 14 and 15
entirely.

Slice 18 needs nothing set up, and is the first slice to cross a line
`docs/PRODUCT.md` had drawn: "Single user. No sharing, no teams, no invites."
It crossed only the narrowest part of it. A workspace is still one person's —
no note, block, task or file is readable by anybody else — and what is new is a
*name*. Signing in with a brand-new account now lands on `/welcome` and asks for
one, which is the only screen in this app that blocks; every other setup step is
still a tickable line on a card that can be skipped for ever. `/login` grew a
"Continue with Google" button beside the magic link, and the setup card grew two
steps (an AI key, a Google account) which appear on it without keeping it up.

The dangerous part of the slice is not the gate, it is the lookup, and the whole
of it is proved against the real database in `modules/profiles/username.test.ts`
(10 tests) — signed in as two real users through the anon key, because the
service-role key bypasses RLS and a test written with it would pass whether the
policies existed or not. **A prefix of a real username finds nobody**, at every
prefix length, and neither does a suffix or a fragment, while the exact string
finds them every time — the positive control matters, because without it every
other assertion would also pass if the function were simply broken. Bob cannot
`select` Alice's row by id or by username or at all, and can read his own the
moment he has one. A username is unique case-insensitively because a functional
index says so, not because the service checked first.

Migration 013 also evicted another application's eighteen tables, twenty-eight
functions and one `auth.users` trigger from this database. They were not in the
migration ledger and were never ours. See `docs/DECISIONS.md`, "The trip app in
the Recalc database" — the trigger had been writing a row for every Recalc
sign-up since 29 August.

Slices 19 and 20 have their schema settled but no code: `friendships` with two
directional visibility columns (what I show you and what you show me are
different choices), and a second `security definer` function for the timetable
comparison. `sessions` has no `workspace_id` — it reaches a workspace only
through `courses` — so its RLS policy is three tables deep already and must not
be widened.

## What to build next

The seventeen planned slices are done, and slice 18 has been added on top of
them. This list is not a wishlist — every item is something the build actually
ran into, and every one of them is already written down under "Noticed, not
fixed" in `docs/DECISIONS.md`. In order.

1. **Make a note's version move when its set of paragraphs changes.** Adding a
   paragraph stales nothing, and soft-deleting one stales nothing either,
   because the cascade fires on a version bump of a block already on a receipt
   and a brand-new paragraph is on nobody's receipt. This is the single biggest
   hole in the sentence this whole product exists to say. It is a change to
   `modules/notes` and `modules/blocks`, and it is half a day.
2. **Paste a provider key in and drive the whole thing once.** No summary, no
   answer, no embedding and no email extraction in this project has ever been
   produced by a real model. Every mechanism is proved; every *prompt* is
   guesswork. Note that `vector(1536)` is a hard width, so the `embed` role
   wants OpenAI's `text-embedding-3-small` and not a Gemini model.
3. **One "needs you" surface.** `/review` has a nav column and a badge;
   `/inbox` has neither and is reached through Settings; a dead Gmail token is
   invisible outside `/settings/email`. Three separate notes in DECISIONS.md
   asking for the same thing. One destination, one badge, three sections.
4. **The sentence from `docs/PRODUCT.md`.** "6 questions on Unit 3 you never
   resolved, zero on Unit 1. You've spent 3 hours on Unit 1 and 20 minutes on
   Unit 3. Exam in 9 days." Questions, study minutes and syllabus units all
   exist and are all linked. Nothing has ever multiplied them together, and it
   is the thing no other study app can say.
5. **Name the Google account everywhere Drive touches.** `modules/google`'s
   `find`, `getDriveAccessToken`, `getPickerToken` and `disconnectGoogleAccount`
   still mean "*the* account" — they read the oldest row. Slice 14 fixed the
   Gmail half; with two accounts connected, `/settings/drive`'s Disconnect
   button is a trap.
6. **Stop paying to embed rows nothing reads, and land search on the passage.**
   `pending_embeddings` indexes summaries, questions and answers, and `/search`
   drops every hit that does not resolve to a note; a result links to the note
   rather than to the paragraph. Both are small, and both are money or attention
   currently being spent for nothing.

Below those, in rising order of how much they will annoy you: `/review`'s
failure copy still says "press Summarise" whatever the recipe was;
`modules/courses` has no way to set a lecture's room, so an accepted room change
can only be marked `moved`; and `getUnresolvedQuestions` reads the whole
semester to draw one course page.

## Slice 25 — bands, the parts of a day

Built. The first screen in this app that draws a whole day.

Every screen before this one assumed the eight hours between 07:30 and 15:40
were the day. A **band** is a named, recurring stretch of the day that runs by
its own rules — University is one, an evening is another — with a fixed weekly
frame and, inside it, its own weekly slots. `/calendar?v=full` draws all
twenty-four hours, deliberately uncropped, as bands rather than as classes; drag
on it to draw a new one; click one to open it; `/bands` and `/bands/<id>` are
where the frames and the slots are edited. `/today` gained one line saying which
part of the day this is and how much of it is left.

The dangerous part is not the grid, it is the lens, and the whole of it is
proved against the real database in `modules/bands/bands.test.ts` (16 tests).
**The university band owns no classes.** It is drawn from `sessions` and
`class_meetings`, exactly as `/timetable` is, so deleting it — the most alarming
thing this feature can do — destroys a frame and leaves every lecture, every
instant, every id and the note block attached to one of them exactly where it
was. The test asserts the ids, not the count, because a note is attached to a
lecture by id. If a later session ever gives a band a foreign key that cascades
into the semester, that file fails.

The other rules it holds: two bands never cover the same minute of the same
weekday (which is what lets `/today` say "you are in University" rather than
hand back a list), a slot sits inside its band and on a day it runs, the
university band takes no slots at all, and moving a frame moves nothing inside
it.

Migration 019 seeds the university band from the printed timetable — first
period's start to last period's end, on the days that actually have a class —
so the screen is right the first time it is opened, with no setup step.

## Slice 26 — a part of your day, shown to a friend

Designed, not built. Scoped out of 25 on purpose: it needs a third
`security definer` function and RLS tests with three real signed-in sessions,
which has been a full slice every time this codebase has done it.

A share level per band, and `friend_bands(p_friend_id)` shaped exactly like
`friend_timetable` — accepted friendships only, nulls at `busy` rather than
omitted columns, so the shape of the row does not give the level away.
`band_slots` already carries `workspace_id` so that policy is one join and not
four; see `docs/SCHEMA.md`.

## Stopping rule

You can stop after any slice and still have a working app. If a slice is dragging
past a session, split it and record the split here rather than pushing through.
