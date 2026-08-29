# Setting up a semester

Twenty minutes, once a term, and **all of it happens inside the app**. There is
no longer any reason to open the Supabase table editor.

Slice 16 built `/timetable`; slice 17 built the screens around it. What follows
is the order to do it in — the same order the setup card on `/today` walks you
through, because that card is this page with fewer words.

> If you are reading this because something is already wrong, skip to
> [Check it](#6-check-it) at the bottom. `scripts/seed-check.ts` still exists
> and is still the fastest way to see what the database actually thinks.

---

## The two conventions to get right

Nothing types these by hand any more, but every screen below is built on them
and a bug in either is invisible until November.

**Weekday numbers.** `sessions.weekday` is a single digit:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Sun | Mon | Tue | Wed | Thu | Fri | Sat |

**Times.** `periods.starts_at` and `sessions.starts_at` are wall-clock times of
day: `09:00`, `14:30`, `17:00`. No date, no timezone, no am/pm. They mean what a
printed timetable means — nine in the morning, where you are.

The timezone is applied **exactly once**, when dated lectures are generated, and
it is `Asia/Dubai` for this term. On Vercel that comes from the `TZ` environment
variable; locally it is whatever the laptop is set to. Everything that crosses
the wall-clock/instant boundary takes the zone as an explicit argument — see
`lib/time.ts` and the decisions on it in `docs/DECISIONS.md`.

Dates (`term_start`, `term_end`, `valid_from`, `valid_until`) are `YYYY-MM-DD`.

---

## 1. Sign in. The setup card does the rest

Signed in with an empty database, `/today` shows one card with three steps, each
ticked off real data as it appears:

1. say when term runs
2. add your courses
3. fill in your timetable

It is not a wizard — nothing is blocked behind it, every screen renders empty
perfectly well — and it disappears for good once there is a course and a term.
**Skip** hides it before then. That is a cookie, not a row in the database; it
has no other effect.

---

## 2. Term dates — `/timetable`

Two dates at the top of the grid: **Term starts** and **Term ends**, saved on the
workspace. Everything downstream reads them, so they are typed once rather than
retyped into a form every time lectures are generated.

Until they are set, adding a class still saves the weekly slot — there is simply
nothing dated to make from it yet, and the screen says so.

---

## 3. Courses — `/courses` and `/courses/<id>/settings`

Two ways in, and both end in the same row:

- **From the grid.** Click an empty cell on `/timetable`, choose *a course not on
  this list*, type a code, a name and a colour. This is the fast path: "MP&I
  meets 3rd period on a Wednesday" is one thought and it should not need two
  screens.
- **From `/courses`.** A code and a name at the foot of the list. Use this for a
  course with no weekly class at all — a project, a reading course — which the
  grid has nowhere to put.

Everything else about a course lives on **`/courses/<id>/settings`**:

| Field | Notes |
|---|---|
| `code` | The subject code, e.g. `ME301`. Shown on every screen in the app. |
| `name` | Full title, e.g. `Thermodynamics I`. |
| `colour` | One of the eight course colours. Eight radio buttons; no hex anywhere. |
| `instructor` | Optional. |
| `credits` | Optional. Halves are fine: `1.5`. An empty box means *not recorded*, which is not the same as zero. |
| `term` | Free text, but be consistent: `Fall 2026` everywhere. |

`code` must be unique within a term — the database refuses a second `ME301` in
`Fall 2026`, which is deliberate.

### Deleting a course

**Delete is for a course typed in by mistake.** The button is on the settings
screen, and it refuses the moment anything is written against the course: a
note, an attached file, a task, or a lecture you have edited. The refusal says
what is in the way.

That is not caution for its own sake. `courses` cascades to `class_meetings`,
and a lecture is the row a note hangs off — deleting the course would leave the
note's `blocks` rows unreachable, which is the same as losing them. A course you
have actually used is *corrected*, not deleted.

---

## 4. The timetable — `/timetable`

Numbered periods down the side, Monday to Friday across, one cell per slot. This
is the shape the printed timetable is written in (`last_sem.jpeg`), which is why
it is the shape the app uses.

- **An empty cell** opens a small form: which course, which room, is it a lab.
  The times come from the period — they are never typed.
- **A filled cell** opens the same form to change it.
- **Remove** drops the weekly slot and this term's *remaining, untouched*
  lectures for it. A lecture with a note, a topic, a syllabus unit, a file, a
  task, a cancellation — or one that has already happened — is kept, keeps
  everything attached to it, and stays on the calendar. See
  `modules/timetable/timetable.test.ts`.

Adding or editing a class regenerates the rest of term automatically. There is
exactly one generator in this project and it is additive: it creates only the
lectures that do not exist, brings untouched ones back into line, and never
modifies or duplicates one that has been written on.

A course that meets twice a week at different times is **two cells**, which is
the normal case, not an edge case.

---

## 5. Periods — `/timetable/periods`

The rows of the grid, and their times. Nine are seeded to match `last_sem.jpeg`:
fifty minutes each, five minutes apart, `07:30` to `15:40`.

Two things to know.

**The image disagrees with itself.** The handwritten grid says fifty minutes a
period (7:30–8:20); the printed table underneath it says forty (7:30–8:10). Only
you know which one this term runs on. Nothing in the code picks — this screen is
where you do.

**Saving a row moves no lecture.** This is the important sentence on the page and
it is load-bearing:

> `sessions.starts_at` is authoritative. A period's times are **copied into** the
> session when a class is added; the grid does not read a lecture's time through
> a join.

So editing the 3rd period from 09:20 to 09:00 changes the row heading, and the
times any class you add *afterwards* is given, and nothing else. Every lecture
already on your calendar keeps the instant it was made with, and so does every
note attached to one.

Classes still sitting on the old time are then marked on the row, with an
**Apply** button beside them. Pressing it is the only thing that moves a lecture,
it only ever moves *future, untouched* ones, and it is your decision, not the
app's. `modules/timetable/period-edits.test.ts` is the test that keeps all of
this true.

- **Add row** appends one — the spare `+1` at the foot of the printed timetable,
  pre-filled to continue the pattern.
- **Remove row** removes the heading only. The classes on it keep their own times
  and stay on the calendar; the grid draws them by time instead, or lists them
  underneath as not sitting on the grid.

---

## 6. Syllabus units — `/courses/<id>`

Type the topics in from the syllabus PDF: type, enter, type, enter. Then per
unit:

- **Rename** — click the title.
- **Reorder** — the two arrows. Positions are rewritten `1..n` after every move.
- **Status** — one tap cycles `not_started → shaky → comfortable → mastered` and
  round again. It is always set by hand; nothing is inferred from minutes or
  attendance, because a guess here would make the one honest number in the app a
  lie.
- **Remove** — the `×`. Safe: every foreign key pointing at a unit is
  `on delete set null`, so a lecture that covered it keeps its note and a task
  set on it keeps its title. What is lost is the filing, not the writing.

---

## 7. Editing one lecture

A cancellation, a room change, what the lecture actually covered — all of it is
on that lecture's own page, reached in one tap from the calendar. Nothing about
one lecture is edited from the timetable, because the timetable is the pattern
and a lecture is a thing that happened.

A one-off extra class — a make-up, a guest lecture, an exam — is added from the
calendar and has no `session_id`, which is exactly what stops the generator ever
touching it.

---

## 8. Check it

The script from slice 01 still exists and is still the honest answer:

```bash
npx tsx scripts/seed-check.ts --tz=Asia/Dubai
```

It prints your courses, your classes today, and your class meetings and tasks for
the next seven days. Add `--date=2026-10-13` to look at a specific day — useful
in August when term has not started.

What you are checking for:

- every course appears once, with the right code
- a Tuesday shows the classes your printed timetable says are on a Tuesday
- the times read as the times on your timetable, not shifted by a few hours
  (if they are shifted, `TZ` is wrong — see the conventions at the top)
- rooms are right

It can still **generate** as well, which is what `/timetable` now does for you:

```bash
npx tsx scripts/seed-check.ts --tz=Asia/Dubai --generate=2026-09-01..2026-12-19
```

Running it twice is safe. It never duplicates a lecture and never touches one you
have written on. `/settings/semester` is the same thing with a button, and is the
right tool when you have corrected several classes at once.

---

## What is left in the Supabase table editor

Nothing you need for a semester. The tables the app does not yet have a screen
for — `derivations`, `email_proposals`, `block_embeddings` — are all engine
internals, and none of them is something to type by hand.
