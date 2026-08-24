# Slice 01 — Semester data

Read `CLAUDE.md` and `docs/SCHEMA.md` first.

## Goal

The semester tables exist and my real Fall 2026 timetable is in them. No UI yet —
I will type the data straight into the Supabase table editor.

## Build

1. **Migration 002** — `courses`, `sessions`, `class_meetings`, `syllabus_units`,
   `tasks` exactly as specified in SCHEMA.md under "Semester layer". RLS on all five,
   scoped through `workspace_id` to the owning user.

   Read the note in SCHEMA.md about `sessions` vs `class_meetings` carefully. They are
   not the same thing and collapsing them into one table will break slices 04, 05
   and 15.

2. **The courses module** — `modules/courses/` (repo, service, index) with reads for:
   - all courses in a workspace
   - meetings falling on a given date or date range, ordered by start time
   - syllabus units for a course, in order

3. **The tasks module** — `modules/tasks/` with create, update status, and
   "due between two dates" queries.

4. **Meeting generation** — `modules/courses/service.ts` gets
   `generateMeetings(termStart, termEnd)`, expanding `sessions` into `class_meetings`.
   Idempotent: safe to run twice, never duplicates, never overwrites a meeting that
   already has a note or files attached. Slice 04 will call this from the UI.

5. **A seed helper** — `scripts/seed-check.ts`, runnable with
   `npx tsx scripts/seed-check.ts`, that prints my classes for today and my next
   seven days of tasks and class meetings. This is how I verify the data is right
   before any UI exists.

6. **`docs/SEEDING.md`** — a short note telling me exactly which columns to fill in
   the Supabase table editor for each table, in what order, with one worked example
   row per table. Weekday numbering and time format spelled out explicitly.

## Constraints

- No pages, no components. Data layer only.
- `sessions` must handle a class that meets twice a week at different times.
- Times are stored so that "what's on today" is a simple query — do not overthink
  recurrence, this is one semester with a fixed weekly timetable.

## Definition of done

I will: enter my real courses and class times in the Supabase table editor following
`docs/SEEDING.md`, generate meetings for the term, then run
`npx tsx scripts/seed-check.ts` and see my actual Tuesday classes printed correctly
with the right subject codes and rooms.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
