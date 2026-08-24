# Slice 07 — Focus

Read `CLAUDE.md` first.

## Goal

A Pomodoro timer whose real output is data: minutes studied per syllabus unit.
The timer is trivial. The log is the point.

## Build

1. **Migration** — `study_sessions` per SCHEMA.md.

2. **`/focus`** — 25/5 timer, start/pause/stop, with a required "what are you working
   on?" that picks a course and optionally a syllabus unit before starting.

3. **Survives a refresh and a locked phone.** Store the start time, not a countdown —
   compute remaining time from the clock. Do not rely on a `setInterval` staying alive.

4. **On completion**, write a `study_sessions` row and ask one optional question:
   how focused was that, 1–3. Skippable in one tap.

5. **`modules/study`** with: minutes this week per course, minutes per syllabus unit,
   and last-studied date per unit. These queries are what slice 12 needs later.

6. **A small strip on `/today`** showing minutes studied today.

## Constraints

- No sounds, no notifications, no streaks, no gamification.
- Do not build a stats dashboard. Two numbers on `/today` is enough for now.

## Definition of done

I will: run a 25-minute session on a real syllabus unit, lock my phone halfway
through, come back, and see it complete correctly and log against that unit.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
