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

## If you run out of steam

Slices 00–09 give you a genuinely good semester planner. Slices 11 and 12 are the
part that does not exist anywhere else. If time gets tight, skip 14 and 15
entirely.

## What to build next

The fifteen planned slices are done. This list is not a wishlist — every item is
something the build actually ran into, and every one of them is already written
down under "Noticed, not fixed" in `docs/DECISIONS.md`. In order.

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

## Stopping rule

You can stop after any slice and still have a working app. If a slice is dragging
past a session, split it and record the split here rather than pushing through.
