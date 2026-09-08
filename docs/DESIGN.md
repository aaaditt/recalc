# Design system

Read this before building any screen. It exists so that sixteen slices built in
sixteen separate sessions look like one app made by one person.

## Principles

1. **Legibility beats decoration.** This is read at 7:45am half-awake and at 11pm
   exhausted. Every decorative choice that costs clarity is wrong.
2. **One-handed on a phone, keyboard-fast on a laptop.** Both, not one.
3. **Instant.** No skeleton loaders on primary content. Server-render it.
4. **Calm.** Colour means something here — it identifies a course. Nothing else gets
   to be colourful, or the signal is lost.
5. **Quiet chrome, warm content.** The interface is neutral and gets out of the way;
   the things I wrote are the only part that should feel personal.

## Type

| Role | Face | Notes |
|---|---|---|
| UI / chrome | **Geist Sans** | ships with Next.js. Excellent tabular figures — the calendar depends on them. |
| Note content | **Source Serif 4** | writing should feel like writing, not like filling in a form. |
| Data / codes / times | **Geist Mono** | subject codes, times, durations |

Everywhere digits align in a column — times, durations, dates, counts — set
`font-variant-numeric: tabular-nums`. Non-negotiable in the calendar.

Scale: `12 · 13 · 14 · 16 · 20 · 26 · 34`. Nothing between. Body 16, UI labels 13,
calendar grid text 12 minimum — **never smaller than 12px anywhere**.

## Neutrals

A cool grey with a slight blue bias, not pure grey. **These exact values are approved
and were used to build the signed-off mockups — use them verbatim, do not re-pick.**

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F5F6F8` | `#0E1116` |
| `--surface` | `#FFFFFF` | `#161A21` |
| `--sunken` | `#EDEFF3` | `#1B2029` |
| `--border` | `#DFE2E9` | `#262C37` |
| `--line` (hairline inside cards) | `#E9EBF0` | `#1F242D` |
| `--text` | `#171B24` | `#E6E9EF` |
| `--text-muted` | `#5C6675` | `#939DAD` |
| `--text-faint` | `#8A93A3` | `#6E7889` |
| `--accent` | `#C2600C` | `#E0913F` |
| `--accent-bg` | `#FBF0E4` | `#2B2113` |
| `--ok` (fresh) | `#216356` | `#5AB79F` |
| `--ok-bg` | `#E4EFEB` | `#13251F` |

The accent is the stale/attention colour. It is deliberately more saturated than any
course colour, and it appears in exactly two places: **something needs attention**, and
**the now-line**. Nowhere else. If it shows up, something wants me.

## Course colours

Eight, assigned on course creation, changeable by me. Mid-lightness and moderate
chroma so they work as a 3px rail, an 8% tint, and a 6px dot — all at once.

```
indigo  #5B6EE1     rose    #C25C6E     olive  #8A9440
teal    #2E9E8F     violet  #7D62C4     clay   #B5654F
amber   #C6803A     sky     #3D8FCB
```

**Never fill a calendar block with a saturated course colour.** Six saturated blocks
is a fruit salad and it stops being scannable. The rule is:

- 3px left rail in the full colour
- background at ~8% alpha of the colour
- **text in `--text`, never in the course colour**

That is the difference between this looking premium and looking like a school portal.

## Spacing and shape

4px base scale: `4 · 8 · 12 · 16 · 24 · 32 · 48`. Radius: 6px for blocks and cards,
10px for sheets and modals, full for pills. One shadow, used sparingly, for things
that genuinely float. Hairlines everywhere else.

Tap targets: **44px minimum** on touch. This will feel too big on desktop; it is not.

---

# The calendar

The most-looked-at screen in the app. Four views, and each has one job.

## Week view — the default on desktop

- **Time gutter** on the left, times right-aligned in mono.
- **Auto-crop the range.** Do not render 00:00–23:59. Find my earliest and latest
  class in the visible week, pad by one hour, show that. A calendar mostly full of
  empty night hours is the single most common way this screen goes wrong.
  (The 24-hour view, below, is the one deliberate exception. This rule still
  binds week, day and month.)
- **Five columns if I have no weekend classes**, seven if I do. Detect it.
- **Class block** shows, in order of priority as height allows:
  1. subject code (mono, e.g. `ME301`)
  2. course name
  3. room
  A 30-minute block will only fit the code and room. Degrade gracefully — never clip
  text mid-word, never shrink below 12px.
- **Now-line**: a 1px accent line across the grid at the current time, with a 5px dot
  in today's column. Updates each minute.
- **Today's column** gets a barely-there tint. Barely.
- **Overlapping classes** split the column side by side. Never stack so one hides
  another.
- **Deadlines are not classes.** They go in a slim all-day row pinned above the grid,
  as chips. Do not put a due date inside the time grid.
- Click a class → the lecture page.

## Day view — the default on mobile

A week grid at 390px is unreadable. Most student apps ship one anyway. We do not.

- A **swipeable date strip** across the top: seven days, current day marked, dots
  under days that have classes.
- Below it, a vertical timeline for that day. Generous blocks. Room and code legible
  without zooming.
- The now-line here too.
- Tap → lecture page.

## Month view — deadlines, not lectures

For seeing shape and pressure, not detail.

- Each day cell: small course-colour dots for its classes, and a count badge for
  deadlines.
- No text inside cells beyond the date and the badge.
- Tap a day → day view for that day.

## The 24-hour view — the whole day, and the parts of it

Added in slice 25, and the one view in this app that **never crops its hours**.

The rule above exists because a *class* calendar full of empty night hours is
noise. This view is not a class calendar. It draws a whole day so I can see the
shape of it, and the gap between the last lecture and whatever happens next is
the question it is asking. Crop it and the feature is gone.

The day is drawn as **bands** — named, recurring stretches that run by their own
rules. University 07:30–15:40 is one; an evening is another. A band is a
*frame*: the university band owns no class data at all, and is drawn from the
same `sessions` and `class_meetings` everything else reads.

- **One day at a time**, `←`/`→` to move, `T` for today, `F` to get here. Twenty-four
  hours across five columns is unreadable on a laptop and absurd on a phone.
- **A band draws as one container**, never as a pile of blocks: its name, a
  count line, and a thin rail of tick marks showing where the day's density is.
  The individual classes are what opening it is for. Drawing them twice would
  make the summary pointless and would need an 80px hour row.
- **A band has no colour.** Principle 4 — colour identifies a course and nothing
  else. A band is chrome: a hairline and a surface. The only colour on this
  screen is on the tick rail, and it belongs to the courses inside.
- **Anything outside every band draws normally.** A band is a frame, not a filter.
- **Empty stretches stay empty.** No compression, no "night collapsed" control.
- **Opening a band** crops the day to its span at the day view's 72px row, and
  draws its contents at full size — class blocks for university, slots for
  everything else.
- **Drag on the background to draw a new band**, snapped to five minutes. There
  is always a 44px button that does the same thing: drag is an accelerator,
  never the only door.

## Rules that apply to all four

- Transitions ≤150ms, and none tied to scrolling.
- Changing week or day must never show a loading state. Prefetch neighbours.
- A cancelled class renders struck through and dimmed — still visible, because
  knowing a class is cancelled is more useful than it vanishing.
- Keyboard on desktop: `←`/`→` to move, `T` for today, `W`/`D`/`M` to switch views.

---

# The lecture page

Every dated class meeting has its own page, reachable in one tap from the calendar.
This is where a lecture actually lives.

Header: subject code, course name, date, time, room. Cancelled state if it applies.

Body, in this order:

1. **Notes** — one note document per meeting, created on first open. Opening
   tomorrow's lecture and starting the note before class must work.
2. **Files** — anything attached: slides, a photo of the whiteboard, the problem
   sheet. Thumbnails, opening in place where possible.
3. **Questions** — asked during this lecture, with their status. (Arrives in slice 12.)
4. **Tasks** — set in this lecture.
5. **Topic** — which syllabus unit this lecture covered. Settable in one tap; this is
   the link that makes the study analytics work later.

## What not to build

No dashboard of statistics. No streaks, badges, or scores. No AI summary of my week
on the home screen. No charts anywhere until I explicitly ask for one. Every one of
those is a thing that looks impressive in a screenshot and gets ignored by week three.


---

# Measurements taken from the approved mockups

These are settled. Build to them rather than re-deriving.

## Chrome

- Desktop sidebar: **216px**, `--surface`, 1px `--border` right, 18px/12px padding
- Top bar: **56px** high, 1px `--border` bottom
- Mobile bottom nav: **62px** high, 1px `--border` top
- Card radius **6px**, sheet radius **10px**, pills fully round
- Buttons: **32px** high, 6px radius, 14px horizontal padding

## Class blocks (all views)

- Left rail **3px solid** in the course colour
- Background **8% alpha** of the same colour — `rgba(R,G,B,.08)`
- Radius **5px**, padding **7px 9px**
- Text order: subject code (mono, 12px, weight 500) → course name (12.5px) → room and
  time (11.5px, `--text-muted`) — **always in `--text`/`--text-muted`, never the
  course colour**
- Under ~80px tall, drop the course name and keep code + room

## Week grid

- Hour row height **80px**; a 90-minute class is 120px tall, a 60-minute one 80px
- Time gutter **56px** wide, labels mono 11px, right-aligned, sitting on the hour line
- Hour lines 1px `--line`; day column dividers 1px `--line`
- Today's column: `rgba(194,96,12,.035)` — barely there, on purpose
- Now-line: 1px `--accent` at 55% opacity across the full grid, plus a **7px** dot in
  today's column
- Cancelled: `opacity: .5`, tint dropped to 5%, code and status struck through
- Overlapping classes split the column width evenly with a 3px gap
- Deadline chips live in a **42px** all-day row above the grid, never in the grid

## Day view (mobile)

- Date strip: 7 days, selected day a **34px** dark filled circle, a **4px** accent dot
  under any day with classes
- Hour row height **72px**
- Class blocks inset 60px from the left (clearing the time labels), 14px from the right

## 24-hour view

The only measurements here that were chosen rather than quoted, because this
section did not describe a whole-day grid before slice 25. The reasoning is
written out in `lib/bands.ts`.

- Hour row height **36px**. 80px × 24 is 1920px — a day you scroll twice to
  see. 36px × 24 is 864px, a whole day at a glance on a laptop and one short
  scroll on a phone. It is affordable only because this view draws bands rather
  than classes, so nothing on it has to fit three lines into fifty minutes.
- Band container: 6px radius, 1px `--line`, `--surface`; the band the clock is
  currently inside gets `--border` and `--sunken`. No accent — being at
  university is not something that needs my attention.
- Tick rail **3px**, marks in the course colour, minimum width 1% so a
  fifteen-minute thing is still visible.
- Drag snaps to **5 minutes**; a drag under **15 minutes** is a wobbled tap and
  is discarded. On touch the finger must rest **350ms** before a drag begins, so
  scrolling still works.

## Month view

- Day cell: date in a 24px circle (filled dark when today), class dots **5px**,
  deadline count as a small accent pill top-right
- Nothing else in the cell

## Fonts

Geist (UI) · Geist Mono (codes, times, labels) · Source Serif 4 (note body only).
All three are on Google Fonts. Load via `next/font`.
Uppercase mono labels: 11px, `letter-spacing: .12em`, `--text-faint`.
