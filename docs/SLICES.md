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
| 06 | Tasks — CRUD, linked to courses, units and lectures | not started |
| 07 | Focus — Pomodoro logged against a syllabus unit | not started |
| 08 | Syllabus — ordered units, status, progress | not started |
| 09 | Google Drive — connect, picker, attach files to lectures | not started |
| 10 | Agents — BYOK settings, encrypted keys, role registry | not started |
| 11 | **Recalc engine** — derivations, first recipe, /review queue | not started |
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

## If you run out of steam

Slices 00–09 give you a genuinely good semester planner. Slices 11 and 12 are the
part that does not exist anywhere else. If time gets tight, skip 13, 14 and 15
entirely and go straight from 10 to 11.

## Stopping rule

You can stop after any slice and still have a working app. If a slice is dragging
past a session, split it and record the split here rather than pushing through.
