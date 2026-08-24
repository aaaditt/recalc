# Slice 04 — Calendar

Read `CLAUDE.md`, and **the entire calendar section of `docs/DESIGN.md`** — it is a
specification, not a suggestion. Every rule in it exists because breaking it is how
this screen goes wrong.

## Goal

The screen I plan my semester in. Premium, instantly readable, and genuinely nice to
look at. This is the most-looked-at page in the app.

## Build

1. **`/calendar`** with three views — week, day, month — per DESIGN.md. Week is the
   desktop default, **day is the mobile default**, month is for deadlines.

2. **Meeting generation** — a one-time job that expands `sessions` + term dates into
   `class_meetings` rows. Runnable from `/settings/semester` with a term start and end
   date. It must be safe to run twice: never duplicate, never overwrite a meeting that
   already has notes or files attached.

3. **The week grid**, exactly to spec:
   - auto-cropped time range (earliest to latest class in view, ±1 hour) — **never
     render a full 24 hours**
   - 5 or 7 columns, detected from whether I have weekend classes
   - class blocks with a 3px course rail, ~8% course tint, and text in `--text`
   - subject code in mono, then course name, then room — degrading by available height
   - a live now-line with a dot in today's column
   - side-by-side splitting for overlaps
   - deadlines as chips in a slim all-day row above the grid, never inside it
   - cancelled meetings struck through and dimmed, not hidden

4. **Day view** with the swipeable seven-day strip, dots under days that have classes.

5. **Month view** — dots and deadline counts only. Tap a day to open it.

6. **Editing** — drag to move or resize a meeting on the week grid, and a one-tap
   "cancel this class". Editing one meeting must never affect the others.

7. **Navigation** — `←`/`→`, `T` for today, `W`/`D`/`M` for views on desktop; swipe on
   mobile. Changing week must not show a loading state — prefetch the neighbours.

8. **Add a one-off** — a class that is not part of the weekly pattern (a make-up
   lecture, a guest lecture, an exam), with `session_id` null.

## Constraints

- **Build the grid yourself.** Do not install FullCalendar, react-big-calendar, or
  any calendar library. They all fight the design spec and none of them will do the
  rail-and-tint treatment or the auto-cropped range properly.
- No colour outside the course palette and the tokens.
- Must be genuinely usable one-handed at 390px. Test at that width before saying done.

## Definition of done

I will: generate meetings for the whole term from my real timetable, open the week
view on my laptop and see my actual week looking clean and calm, then open the day
view on my phone and navigate three days forward one-handed without anything feeling
cramped. Then I will cancel one class and see it struck through.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
