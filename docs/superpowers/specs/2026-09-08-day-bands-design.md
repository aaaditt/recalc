# Bands — the day has parts, and each part runs by its own rules

Slice 25. Design approved 2026-09-08.

## Why

The timetable this app was built around starts at 07:30 and ends at 15:40, and
every screen in the product quietly assumes that those eight hours are the day.
They are not. They are the part of the day spent on a campus, where the
priorities are different, the people are different, and almost nothing that
happens is chosen. The other sixteen hours — the ones where the studying
actually gets done — have never been drawn anywhere.

`/calendar` crops to the classes. `/timetable` is nine numbered rows off a
printed sheet. Neither can answer "what does my day look like", because neither
of them has ever rendered a day.

A **band** is a named, recurring stretch of the day that runs by its own rules.
University is one. Evening is another. A band has a fixed weekly frame —
`07:30–15:40, Mon–Fri` — and, inside it, its own weekly slots. Zoom into the
university band and you get the timetable that already exists. Zoom into the
evening band and you get whatever you decided the evening is for.

The 24-hour view is the first screen in this app where the empty hours are the
content.

## What was decided, and what was rejected

| Decision | Rejected alternative |
|---|---|
| **A fourth view on `/calendar`** (`?v=full`, labelled `24h`) | A new top-level page. The date navigation, the twenty-week prefetch, the now-line and the keyboard shortcuts all already exist on `/calendar`; a second surface would reimplement four solved problems to show the same days |
| **A fixed weekly frame.** University is 07:30–15:40 whether there are nine classes that day or one | A frame that snaps to its contents. Truer to where the body is, but the block moves under you day to day, and the empty tail after the last class is *information* — still on campus, nothing scheduled |
| **Each band owns its own weekly slots** | A band as a pure lens over existing data. "Specific time slots for whatever you want" is the feature; a read-only frame is a different, smaller one |
| **The university band stores no class data** | A band that owns its classes. There would then be two places a class can live and one of them would be wrong |
| **`bands`, not `blocks`** | `day_blocks`. `blocks` is *the* primitive — `docs/SCHEMA.md`: "THE PRIMITIVE. Everything in the app is a row here." A second table with `block` in its name that is emphatically not that primitive is a collision that costs an evening later |
| **`weekdays int[]` on a band; `weekday int` on a slot** | One band row per weekday. A band is one thing happening on several days — moving its end time should be one write, not five. A slot is a specific thing on a specific day, which is what `sessions` already models |
| **No midnight crossing in v1** (`ends_at > starts_at`, in SQL) | Wrapping bands. A 22:00–02:00 band is real and doubles the arithmetic in every view. Ask for it after missing it |
| **Drag-select creates a band, but never as the only way in** | Drag-only creation. Drag-and-drop on a touch grid at 7:45am is where slices go to die; a 44px `+ New band` button is always present |
| **Friend sharing is slice 26** | Shipping it here. It needs a third `security definer` function and RLS tests with three real signed-in sessions, which has been a full slice every time this codebase has done it |

## The data model — migration `019_bands.sql`

```sql
create table bands (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,                          -- 'University', 'Evening'
  kind         text not null default 'custom',         -- 'custom' | 'university'
  colour       text,                                   -- one of the eight, nullable
  starts_at    time not null,                          -- wall clock. No date, no zone.
  ends_at      time not null,
  weekdays     int[] not null default '{1,2,3,4,5}',   -- 0=Sun..6=Sat, sessions' convention
  position     numeric not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint bands_span check (ends_at > starts_at),
  constraint bands_kind check (kind in ('custom', 'university'))
);
create index on bands (workspace_id, position);

-- One university band per workspace, enforced rather than remembered.
create unique index bands_one_university
  on bands (workspace_id) where kind = 'university';

create table band_slots (
  id           uuid primary key default gen_random_uuid(),
  band_id      uuid not null references bands(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  label        text not null,
  course_id    uuid references courses(id) on delete set null,
  weekday      int not null check (weekday between 0 and 6),
  starts_at    time not null,
  ends_at      time not null,
  created_at   timestamptz not null default now(),
  constraint band_slots_span check (ends_at > starts_at)
);
create index on band_slots (band_id, weekday, starts_at);
create index on band_slots (workspace_id);
```

RLS is enabled on both, with a policy keyed on `workspace_id` ownership, per
rule 8. The anon key ships to the browser.

`bands.position` is a fractional index and has no default — the service assigns
the midpoint, the same convention `blocks.position` uses, so reordering never
renumbers a table.

### Why `band_slots` carries `workspace_id`

It is reachable through `band_id`, so the column is redundant. `sessions` made
the other choice and `docs/SCHEMA.md` spends two paragraphs on what it cost:
`sessions` reaches a workspace only through `courses`, its RLS policy is three
tables deep, and slices 22 and 23 both had to route around it with `security
definer` functions rather than widen it. Slice 26 will want to read a friend's
bands. One redundant uuid now is cheaper than a fourth join then.

### `course_id` on a slot

Optional. A slot with one renders with the course's 3px rail and 8% tint — the
same rule every class block obeys, `docs/DESIGN.md`. A slot without one is
neutral. It exists because `docs/PRODUCT.md` says that when a design decision is
ambiguous, choose whatever gets closer to *"3 hours on Unit 1 and 20 minutes on
Unit 3"*, and an evening slot that names a course is the only part of this
feature that points that way. Nothing in this slice reads it beyond the colour.

`on delete set null`, not cascade: deleting a course must not silently delete a
recurring slot in someone's evening.

### Seeding the university band

The migration creates it for every existing workspace, from data already there:

- `starts_at` = `min(periods.starts_at)`, `ends_at` = `max(periods.ends_at)`
- `weekdays` = the distinct `sessions.weekday` that actually have a class,
  falling back to `{1,2,3,4,5}` when there are none
- `name` = `'University'`, `kind` = `'university'`, `position` = 1

A workspace with no periods gets no university band, and the screen offers to
make one. There is no setup step: the first time this screen is opened it is
already correct.

## The university band is a lens

`band_slots` for a `kind = 'university'` band is **always empty**, and the
service refuses to write one. What renders inside it is `sessions` (on
`/bands/<id>`, the weekly shape) and `class_meetings` (in the zoomed day view,
the dated shape) — read exactly as `/timetable` and `/calendar` already read
them.

This is the same discipline `app/(app)/timetable/page.tsx` states in its header:
*"It is not a second calendar and there is no second set of data behind it."*
Deleting the university band deletes a frame. It deletes no session, no
`class_meeting`, no note, no file, no task.

## The 24-hour view

`/calendar?v=full`, labelled **24h** in the existing toolbar, keyboard `F`.

**It shows one day at a time**, not seven columns — `←`/`→` move a day, `T` is
today, exactly as the day view behaves. Twenty-four hours across five columns is
unreadable on a laptop and absurd on a phone, and the feature is about the shape
of *a* day. The week view keeps its five-or-seven columns and its auto-crop.

- **It renders 00:00–24:00 and deliberately bypasses `croppedHours`.** This is
  the one view in the app that never crops. See the `docs/DESIGN.md` amendment
  below.
- **Hour rows are 36px** — 864px for the whole day, nearly a laptop viewport,
  scrollable on a phone. The week grid's 80px row exists so a 50-minute class
  can hold three lines of text; this view does not draw individual classes, so
  it does not need it. All text stays at 12px minimum.
- **A band draws as one container**, not as a pile of blocks: its name, a count
  line, and a thin rail of tick marks in course colours showing where the day's
  density sits. The individual classes are what zooming is *for*; drawing them
  twice would make the summary pointless. The count line reads `5 classes · 2
  free` for the university band — free meaning a period with no class in it —
  and `3 slots · free after 21:00` for a custom one. An empty band says
  `nothing planned`, which is a fact worth reading, not an error state.
- **Anything outside every band draws normally** — a one-off meeting at 19:00, a
  deadline chip in the all-day row. A class that falls outside every band draws
  as an ordinary class block, because a band is not a filter.
- **The now-line** works as it does everywhere else, and gains one job: when the
  current instant is inside a band, that band's header says so.
- **Empty stretches stay empty.** No compression, no "night collapsed"
  affordance. The gap between 15:40 and 18:00 is the question the screen exists
  to ask.

### Drag-select to create

Pointer drag on empty background → a live range preview snapped to 5 minutes →
the band sheet opens pre-filled with those times, and with the weekday of the
day on screen already ticked. The other six are there to tick too: a band drawn
on a Tuesday is a Tuesday band until you say otherwise, because guessing Mon–Fri
from one drag is the kind of helpfulness that has to be undone. On touch,
long-press then drag.

A `+ New band` button at 44px is always present and opens the same sheet empty.
Drag is an accelerator, never the only door. The drag itself is one hook,
`useDragRange`, local to the view component — it produces a `{ startMinute,
endMinute }` and knows nothing about bands.

## Zoom

Two ways in, one behaviour.

**In place.** Click a band → `?v=full&band=<id>`. The day crops to that band's
span, the 36px rows become the day view's 72px, and the contents render at full
`docs/DESIGN.md` size — class blocks with rail and tint for university, slots for
everything else. The URL is linkable, the back button works, the transition is
≤150ms and is not tied to scrolling.

**A page.** `/bands` lists the bands. `/bands/<id>` is that band's own weekly
grid — the Mon–Fri shape `/timetable` already uses — and is where slots are
added and edited. `/bands/<university id>` does not duplicate the timetable; it
says what the band is and links to `/timetable`.

## `/today`

One line above the existing content: which band you are in, until when, what is
next inside it, and which band comes after. One extra read — the workspace's
bands, a handful of rows — against the meetings `/today` already loads. When no
band contains the current instant the line does not render at all; an unplanned
evening should not be announced as one.

## Modules

```
modules/bands/
  schema.ts   zod schemas, Band, BandSlot, the eight-colour check
  repo.ts     the only file that touches bands and band_slots
  service.ts  the rules: no overlap, containment, university is a lens
  index.ts    the public API
```

`service.ts` owns three rules that are not expressible as a cheap SQL
constraint:

1. **Two bands never overlap on the same weekday.** An exclusion constraint
   would need a range type per weekday against an array column; the service is
   where this codebase already puts rules of this shape.
2. **A slot must sit inside its band's span**, and on one of its weekdays.
3. **A university band takes no slots**, and its span may be edited but its
   `kind` may not change.

`lib/bands.ts` holds the arithmetic, imports no module and no component, and
mirrors what `lib/calendar.ts` does for the class views:

- which band contains an instant
- a band's span on a given date, in minutes after local midnight
- what falls inside a band on a date — the count line and the tick rail
- the 24-hour grid's row geometry

## Screens

| Path | What it is |
|---|---|
| `/calendar?v=full` | The 24-hour view. New. |
| `/calendar?v=full&band=<id>` | Zoomed in place. New. |
| `/bands` | The list, and where a band is created or deleted. New. |
| `/bands/<id>` | One band's weekly grid, where its slots are edited. New. |
| `/today` | Gains the current-band line. |
| `/timetable` | Unchanged. |

Components are presentational, take no secrets and fetch nothing:
`components/calendar/full-day-view.tsx`, `components/calendar/band-block.tsx`,
`components/bands/band-sheet.tsx`, `components/bands/band-grid.tsx`.

## Testing

`modules/bands/bands.test.ts` — against the real database, signed in through the
anon key, following `modules/timetable/period-edits.test.ts`:

1. **A band frames time, it never owns it.** Deleting the university band leaves
   every session, `class_meeting`, note, file and task exactly where it was —
   same ids, same instants.
2. **A university band takes no slots.** The service refuses; `band_slots` for
   it stays empty.
3. **Two bands never overlap on the same weekday.** Creating an overlapping band
   is refused; the same times on a *different* weekday are allowed.
4. **A slot cannot sit outside its band.** A 23:00 slot in a band ending at
   15:40 is refused, and so is a slot on a weekday the band does not run.
5. **Editing a band's span never moves anything inside it.** Narrowing
   university to end at 14:00 moves no lecture — it only changes what the frame
   says.

`lib/bands.test.ts` — the arithmetic, with no database and no browser: band span
on a date, which band contains an instant, what falls inside, the geometry.

## The `docs/DESIGN.md` amendment

`croppedHours` exists because `docs/DESIGN.md` calls a calendar full of empty
night hours "the single most common way this screen goes wrong". That rule is
written for the class views, where the night is noise. In the 24-hour view the
night is the subject. The doc gains a paragraph saying so, rather than the rule
being quietly broken in code — plus the numbers this view settles: 36px hour
rows, band containers, 5-minute drag snap, and the fact that the auto-crop rule
still binds week, day and month.

## Out of scope

- **Friend sharing.** Slice 26: a share level per band, a `friend_bands()`
  `security definer` function shaped exactly like `friend_timetable` (nulls at
  `busy`, never omitted columns, accepted friendships only), and RLS tests with
  three real signed-in sessions.
- **Bands that cross midnight.**
- **Per-date exceptions.** "No university on the 14th" is a real thing and is
  not this slice. The frame is weekly.
- **Slots feeding study minutes.** `course_id` is stored and coloured; nothing
  multiplies it by anything yet.
- **Drag to move or resize an existing band.** Creation only. Editing is a form.

---

## Amendment — 2026-09-08, written while building it

Four things changed between the approved design and the built slice. All four
are recorded in `docs/DECISIONS.md` as well.

### Bands have no colour

The design gave `bands` a `colour` column. It was removed before migration 019
was applied. `docs/DESIGN.md` principle 4 and `CLAUDE.md` rule 7 both say colour
identifies a course and nothing else; a band is chrome, and a "pick a colour for
your Evening" field would have been the first crack in the one rule that keeps
the calendar scannable. The only colour on the 24-hour view is the tick rail,
which is course colour.

### The count line reads free *time*, not free periods

The design said `5 classes · 2 free`, where "free" meant free periods. Counting
periods needs the `periods` table on a screen that otherwise does not read it.
`5 classes · 1h 20m free` is computed from the band's own span minus what covers
it, needs nothing extra, and is a more useful number. Overlapping occupants are
merged first, so two classes in the same hour do not make the day look twice as
busy as it is.

### The zoom closes itself on a day the band does not run

Not in the design, and it was a real rough edge: stepping from Tuesday to
Saturday while inside the Evening band would have rendered an empty grid.
`bandId` is kept in the URL, so stepping back reopens it.

### The forms are seeded by a remount key, not by an effect

`react-hooks/set-state-in-effect` refused the prop-syncing effect the design
implied, and it was right to. Both sheets initialise their state once from props
and get a `key` at the call site — the arrangement
`components/timetable/class-sheet.tsx` already used.

### What was left out

Friend sharing, as planned: it is slice 26 and is recorded in `docs/SLICES.md`.
