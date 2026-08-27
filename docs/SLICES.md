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
| 12 | **Questions** — ask-about-selection, open questions per course | not started |
| 13 | Search — pgvector over versioned embeddings | not started |
| 14 | Email connect — Gmail OAuth, incremental sync | not started |
| 15 | Email extraction — proposals queue | not started |

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

## If you run out of steam

Slices 00–09 give you a genuinely good semester planner. Slices 11 and 12 are the
part that does not exist anywhere else. If time gets tight, skip 13, 14 and 15
entirely and go straight from 10 to 11.

## Stopping rule

You can stop after any slice and still have a working app. If a slice is dragging
past a session, split it and record the split here rather than pushing through.
