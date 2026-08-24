# Slice 06 — Tasks

Read `CLAUDE.md` first.

## Goal

Every assignment I have lives in this app, and nothing lives in my phone's Notes app
anymore.

## Build

1. **`/tasks`** — list with filters: by course, by status, overdue, this week.
   Fast keyboard-free flows: add, complete, reschedule, all in one tap where possible.

2. **Quick add** — a single input that accepts natural shorthand like
   `Thermo problem set fri 5pm`, parsed client-side. If parsing is ambiguous, show
   what it understood before saving rather than guessing silently.

3. **Selection → task** — selecting text inside a note offers "make a task from this".
   The new task records `source_block_id` pointing at the block it came from, and the
   task view links back to that note.

4. **Today integration** — tasks completed from `/today` without navigating away.

5. **Test** — creating a task from a block sets `source_block_id` and the link
   resolves in both directions.

## Constraints

- No subtasks, no dependencies, no recurring tasks, no priority levels. Due date and
  status only. Add more later only if I ask.
- Completing a task must be one tap from `/today`.

## Definition of done

I will: add every deadline I currently know about, complete one from `/today`, and
create one by selecting a sentence in a lecture note.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
