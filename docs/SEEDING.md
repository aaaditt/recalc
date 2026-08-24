# Seeding the semester by hand

Slice 01 has no UI. You type the timetable straight into the Supabase table
editor, then run one script to check it. Twenty minutes, once a term.

**Supabase dashboard → Table Editor → pick the table → Insert → Insert row.**

Fill the tables **in this order**. Each one references the one above it, and the
editor's dropdowns only offer rows that already exist.

1. `courses`
2. `sessions` — the weekly pattern
3. `syllabus_units` — optional now, needed by slice 08
4. `class_meetings` — **do not type these.** Generate them (step 5 below).
5. `tasks` — optional now, needed by slice 06

Leave every `id`, `created_at` and `updated_at` alone. The database fills them.

---

## The two conventions to get right

**Weekday numbers.** `sessions.weekday` is a single digit:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Sun | Mon | Tue | Wed | Thu | Fri | Sat |

**Times.** `sessions.starts_at` / `ends_at` are wall-clock times of day, typed as
`HH:MM` on a 24-hour clock. `09:00`, `14:30`, `17:00`. No date, no timezone, no
am/pm. They mean what a printed timetable means: nine in the morning, where you
are. The timezone is applied once, when meetings are generated.

Dates (`valid_from`, `valid_until`) are `YYYY-MM-DD`: `2026-09-01`.

---

## 1. `courses`

One row per subject, per term.

| Column | Fill in? | Notes |
|---|---|---|
| `workspace_id` | **yes** | Pick your workspace from the dropdown. There is only one. |
| `code` | **yes** | The subject code, e.g. `ME301`. This is what shows on the calendar. |
| `name` | **yes** | Full title, e.g. `Thermodynamics I`. |
| `term` | **yes** | Free text, but be consistent: `Fall 2026` everywhere. |
| `colour` | optional | Leave empty for now. Slice 02 defines the colour token names. |
| `instructor` | optional | |
| `credits` | optional | A number. Halves are fine: `1.5`. |

`code` must be unique within a term — the database will refuse a second `ME301`
in `Fall 2026`, which is deliberate.

**Worked example**

```
workspace_id : <your workspace>
code         : ME301
name         : Thermodynamics I
term         : Fall 2026
colour       : (empty)
instructor   : Dr R. Menon
credits      : 3
```

---

## 2. `sessions` — the weekly pattern

**One row per class slot per week.** A course that meets twice a week at
different times gets **two rows**. This is the normal case, not an edge case.

| Column | Fill in? | Notes |
|---|---|---|
| `course_id` | **yes** | Dropdown. |
| `weekday` | **yes** | `0`–`6` per the table above. |
| `starts_at` | **yes** | `HH:MM`, 24-hour. |
| `ends_at` | **yes** | `HH:MM`, must be after `starts_at`. |
| `room` | optional | e.g. `B204`. |
| `valid_from` | optional | Leave empty unless the slot starts mid-term. |
| `valid_until` | optional | Leave empty unless the slot stops mid-term. |

**Worked example — ME301 meets Tuesday morning and Thursday afternoon**

```
Row 1:  course_id: ME301   weekday: 2   starts_at: 09:00   ends_at: 10:30   room: B204
Row 2:  course_id: ME301   weekday: 4   starts_at: 14:00   ends_at: 15:00   room: LAB1
```

A lab that only runs after the mid-term break is the same thing with
`valid_from: 2026-10-20`.

---

## 3. `syllabus_units`

Optional in this slice. Slice 08 builds the UI for it.

| Column | Fill in? | Notes |
|---|---|---|
| `course_id` | **yes** | Dropdown. |
| `position` | **yes** | `1`, `2`, `3`… Decimals are allowed, so `1.5` slots between 1 and 2 without renumbering. |
| `title` | **yes** | |
| `status` | leave | Defaults to `not_started`. The others are `shaky`, `comfortable`, `mastered`. |
| `block_id` | leave | Filled in later when the unit gets a note. |

**Worked example**

```
course_id : ME301
position  : 1
title     : Unit 1 — First Law and Closed Systems
status    : (leave — defaults to not_started)
```

---

## 4. `class_meetings` — generated, not typed

These are the actual dated lectures: *ME301, Tuesday 14 October, 09:00, B204*.
Your notes and files attach to these rows, so there is one per real lecture and
they are **not** typed by hand.

Generate them once the courses and sessions are in:

```bash
npx tsx scripts/seed-check.ts --tz=Asia/Dubai --generate=2026-09-01..2026-12-19
```

- `--tz` is the timezone your printed timetable is written in. Pass it
  explicitly; without it the script uses whatever timezone your laptop is set
  to, which is not what you want when you travel.
- `--generate` takes the first and last day of term, inclusive.
- Add `--term="Fall 2026"` to limit it to one term's courses.

It prints, e.g.:

```
Generated meetings for 2026-09-01..2026-12-19: 84 created, 0 updated, 0 unchanged.
```

**Running it twice is safe.** It never duplicates a lecture, and it never
touches a lecture you have edited — one with a note, a topic, a syllabus unit,
or a status other than `scheduled` is left exactly as it is. If you correct a
session's time or room and re-run, the untouched lectures move into line and the
ones you have written notes on stay put. That behaviour is what
`modules/courses/meetings.test.ts` exists to protect.

**Editing one lecture by hand** — a cancellation, a room change, what the
lecture covered — is done directly in the table editor, on that one row:

| Column | Notes |
|---|---|
| `status` | `scheduled` (default), `cancelled`, `moved`, or `held`. |
| `topic` | What the lecture actually covered. |
| `room` | Overrides the pattern's room for this date only. |
| `unit_id` | Which syllabus unit it covered. |

A one-off extra class is a `class_meetings` row you insert yourself with
`session_id` left empty — that is what the nullable `session_id` is for.

---

## 5. `tasks`

Optional now; slice 06 builds the UI.

| Column | Fill in? | Notes |
|---|---|---|
| `workspace_id` | **yes** | Dropdown. |
| `title` | **yes** | |
| `course_id` | optional | |
| `unit_id` | optional | |
| `meeting_id` | optional | The lecture it was set in. |
| `notes` | optional | |
| `due_at` | optional | A full timestamp, **including the timezone offset**: `2026-10-17 23:59+04`. |
| `status` | leave | Defaults to `open`. Others: `doing`, `done`, `dropped`. |
| `effort_min` | optional | Whole minutes, e.g. `90`. |
| `source_block_id` | leave | Filled in when a task comes from a note or an email. |

**Worked example**

```
workspace_id : <your workspace>
course_id    : ME301
title        : Problem set 3
due_at       : 2026-10-17 23:59+04
effort_min   : 90
```

`due_at` is a `timestamptz`, so it is stored as an exact instant. Typing
`23:59` with no offset makes the database read it as UTC — always include the
`+04`.

---

## 6. Check it

```bash
npx tsx scripts/seed-check.ts --tz=Asia/Dubai
```

It prints your courses, your classes today, and your class meetings and tasks
for the next seven days. Add `--date=2026-10-13` to look at a specific day —
useful in August when term has not started.

What you are checking for:

- every course appears once, with the right code
- a Tuesday shows the classes your printed timetable says are on a Tuesday
- the times read as the times on your timetable, not shifted by a few hours
  (if they are shifted, you passed the wrong `--tz` when generating)
- rooms are right

If the times are wrong, fix the `sessions` rows, then re-run `--generate` for
the same term dates. Untouched meetings will move; nothing you have written
against a lecture will be lost.
