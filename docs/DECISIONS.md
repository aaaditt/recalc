# Decisions

Append only. Newest at the bottom. One short entry per architectural choice, so a
future session (or a future Aadit) knows *why*, not just *what*.

Format:

```
## YYYY-MM-DD — <decision>
Because: <reason>
Instead of: <what was rejected, and why>
```

---

## 2026-08-24 — Blocks are the single primitive
Because: notes, tasks, syllabus units, emails, and AI output all need identity,
versioning and provenance. One table means search, staleness and permissions are
written once instead of six times.
Instead of: separate tables per feature, which is how the project becomes nine
half-apps that never talk to each other.

## 2026-08-24 — Raw SQL migrations, no ORM
Because: fewer moving parts, and the schema is the hardest part to get right — it
should be readable directly. Supabase CLI generates the TypeScript types.
Instead of: Drizzle or Prisma, which add an abstraction layer to argue with during
a slice, for no benefit at this size.

## 2026-08-24 — Staleness cascades in a Postgres trigger, not in app code
Because: it must be impossible to bypass. Any path that bumps a version — app code,
a script, the Supabase table editor — fires the same cascade.
Instead of: doing it in the service layer, where one forgotten call silently breaks
the one invariant the product exists for.

## 2026-08-24 — App code asks for a role, never a model
Because: the user brings their own key and may switch providers. `fast` / `deep` /
`embed` resolve through the registry, so switching is a settings change.
Instead of: hardcoding model names, which turns a provider swap into a refactor.

## 2026-08-24 — Encryption key in env, not in the database
Because: storing the key beside the ciphertext defeats the point.
Instead of: pgcrypto with a key in a Postgres setting.

## 2026-08-24 — Single user, no collaboration in v1
Because: real-time multiplayer is a CRDT project that would eat a month, for one user.
Instead of: building for a second user who does not exist. Stable block ids and
versions keep the door open if that ever changes.

## 2026-08-24 — `sessions` (weekly pattern) and `class_meetings` (dated occurrences) are separate
Because: notes, files and questions attach to a *specific lecture on a specific date*.
Cancellations, room changes and one-off make-up classes are per-occurrence too. A
single recurring-pattern table has nowhere to put any of that.
Instead of: one `sessions` table with recurrence rules, which cannot answer "show me
my notes from the 14 October lecture".

## 2026-08-24 — Meetings are generated once, then edited individually
Because: regenerating wholesale would orphan every note and file attached to a meeting.
Instead of: deriving the calendar from the pattern on every render.

## 2026-08-24 — Google Drive via `drive.file` + the Google Picker
Because: `drive.file` is classified non-sensitive, so it needs only basic OAuth
verification, and it grants access *only to files the user explicitly picks* — never
the whole Drive. Best security and least friction at the same time.
Instead of: `drive.readonly`, which is a restricted scope, triggers a security
assessment for production use, and grants access to every file the user owns.

## 2026-08-24 — One `google_accounts` table shared by Drive and Gmail
Because: they are the same Google account with different granted scopes. Two tables
would mean two connect flows and two refresh tokens for one account.
Instead of: separate `drive_accounts` and `email_accounts`.

## 2026-08-24 — Design system is its own slice, before any screen
Because: sixteen slices built across sixteen sessions without shared tokens produce
sixteen different-looking apps. Thirty minutes here saves a UI rewrite in October.
Instead of: styling each screen as it is built and unifying later, which never happens.

## 2026-08-24 — Hand-built calendar grid, no calendar library
Because: FullCalendar and react-big-calendar impose their own DOM and styling, and
would have to be fought for the rail-and-tint treatment, the auto-cropped time range,
and the mobile day view. The grid itself is not the hard part.
Instead of: a library that is faster on day one and an obstacle for the next four months.

## 2026-08-24 — Repos and services take the Supabase client as their first argument
Because: the same code must run as the signed-in user (RLS client) in the app and
as the service role in tests and future jobs. Passing the client in keeps modules
free of hidden globals and free of `server-only` imports that break under vitest.
Instead of: each repo constructing its own client, which welds business logic to
one privilege level.

## 2026-08-24 — The staleness test runs against the real Supabase project
Because: the cascade is a Postgres trigger; mocking it would test nothing. This
machine has no Docker, so `supabase start` is unavailable. The test creates a
throwaway auth user + workspace with the service-role key and deletes them after.
Instead of: a local Supabase stack (no Docker) or a pure unit test (proves nothing).

## 2026-08-24 — Migration 001 deviates from SCHEMA.md in two hardening details
Because: Supabase's security advisors flag both. (1) `vector` is installed
`with schema extensions` rather than into `public`. (2) `mark_derivations_stale()`
pins `search_path = ''` and schema-qualifies its tables, so it cannot be hijacked
by same-named objects in another schema. Logic is byte-for-byte the spec.
Instead of: verbatim SQL that ships two known advisor warnings.

## 2026-08-24 — `plainTextOf` reads `content.text`, falls back to JSON
Because: until TipTap arrives (slice 05) every block the app writes is
`{ text: string }`. Hashing unknown shapes via `JSON.stringify` is stable enough
for now and loudly wrong later, which is what we want.
Instead of: designing the rich-document walker before a rich document exists.

## 2026-08-24 — `proxy.ts`, not `middleware.ts`
Because: the scaffold landed on Next.js 16, which renamed the file; both work but
`proxy` is the current convention and the one the docs will describe.
Instead of: the deprecated name that would need a rename later.

## 2026-08-24 — Server env vars for future slices are optional in `lib/env.server.ts`
Because: `ENCRYPTION_KEY` and the Google credentials are unused until slices 09–10;
requiring them now would block boot for no benefit. Each becomes required in the
slice that first reads it.
Instead of: validating everything up front and failing on vars nothing reads.

## 2026-08-24 — Dependencies added in slice 00
Because (rule 10, one line each):
`@supabase/supabase-js` — the stack's DB/auth client.
`@supabase/ssr` — cookie-based session handling for Server Components/proxy.
`zod` — env validation and module schemas (stack-mandated).
`server-only` — turns a secret leaking into a client bundle into a build error.
`vitest` — the stack's test runner.
`supabase` (dev) — pins the CLI version for migrations/typegen in npm scripts.
Instead of: nothing controversial; all are named in CLAUDE.md's stack table except
`server-only`, which exists purely to enforce Never rule 4.

## 2026-08-24 — Migration history repaired through the Supabase MCP, not the CLI
Because: 001 was applied by pasting into the SQL editor, so
`supabase_migrations.schema_migrations` did not exist at all. `migration repair`
needs an interactive database-password prompt this machine cannot answer. 002 was
applied with `apply_migration`, which created the history table, and its recorded
version was then rewritten to `002` and a `001`/`foundation` row inserted, so the
history now matches the filenames exactly. `npm run db:push` is usable again.
Instead of: `db push`, which would have re-applied 001 and failed on "table
already exists".

## 2026-08-24 — Wall-clock times in `sessions`, instants in `class_meetings`
Because: a printed timetable says "Tuesdays at 09:00" with no timezone. Storing
`sessions.starts_at` as a `time` keeps it honest; `class_meetings.starts_at` is a
`timestamptz` because a lecture happened at one exact moment. The timezone is
applied exactly once, in `generateMeetings`.
Instead of: a timezone column on `courses`, or storing meeting times naively and
letting whatever TZ the process runs under decide (dev laptop, vitest and Vercel
are three different answers).

## 2026-08-24 — Timezone is an explicit argument, defaulting to the machine's zone
Because: every read that crosses the wall-clock/instant boundary takes a
`timeZone`. The default is `Intl.DateTimeFormat().resolvedOptions().timeZone`,
which is right for a single user on their own laptop; tests and the seed script
pass it explicitly so they are reproducible anywhere.
Instead of: hardcoding `Asia/Dubai`, which is a fact about this term, not about
the code.

## 2026-08-24 — A meeting's identity is (session_id, local date), not (session_id, instant)
Because: correcting a session from 09:00 to 10:00 must *move* that Tuesday's
lecture, not add a second one beside it. Keying on the instant would duplicate
every meeting whose time was ever fixed. The unique index on
`(session_id, starts_at)` stays as a database-level backstop against duplicates.
Instead of: matching on the exact timestamp, which is only idempotent while the
timetable is never corrected.

## 2026-08-24 — "Hand-edited" is what `generateMeetings` refuses to touch
Because: SCHEMA.md forbids regenerating over a lecture that has notes or files.
A meeting counts as hand-edited when `note_block_id`, `topic` or `unit_id` is set,
or `status` is not `scheduled`; those are never modified again. An untouched
meeting has its time and room refreshed from the pattern, so fixing a typo'd room
and re-running works. `files` is not checked yet — the table lands in slice 09,
and a file is always attached from a lecture page that also writes
`note_block_id`. Add the check when the files module exists.
Instead of: insert-if-missing only (a corrected timetable would never propagate),
or a blanket overwrite (which is the mistake the schema doc warns about).

## 2026-08-24 — Migration 002 adds four guards SCHEMA.md does not spell out
Because: the seeding path for this slice is a human typing rows into the Supabase
table editor. `sessions.weekday between 0 and 6`, `ends_at > starts_at` on both
`sessions` and `class_meetings`, and a unique `(workspace_id, code, term)` on
`courses` each turn a plausible typo into an immediate error instead of a wrong
calendar in November. `unit_id` and `note_block_id` also got `on delete set null`,
which SCHEMA.md leaves unstated — without it, deleting a syllabus unit fails.
Instead of: bare columns matching the doc byte-for-byte and finding the mistakes
by reading the calendar.

## 2026-08-24 — `tasks.status` is `open | doing | done | dropped`
Because: SCHEMA.md names the column but not its values. `doing` is what makes a
task list honest at 11pm, and `dropped` keeps a cancelled task's provenance
instead of deleting it. It is a text column with a zod enum in front, so slice 06
can change the set cheaply if the UI wants something else.
Instead of: guessing a two-state `open | done` and discovering in slice 06 that
"started but not finished" had nowhere to go.

## 2026-08-24 — `lib/time.ts` holds the timezone maths, not a module
Because: courses and tasks both convert local days to instant ranges, and so does
`scripts/seed-check.ts`. It is a pure shared util with no database access, which
is exactly what `/lib` is for. It has its own test because offset arithmetic is
where this slice would fail silently.
Instead of: duplicating the Intl offset dance in two modules, or inventing a
`modules/time` that owns no table.

## 2026-08-24 — `scripts/seed-check.ts` builds its own Supabase client
Because: `lib/supabase/admin.ts` imports `server-only`, whose default export
throws outside a React Server Component — so a plain `tsx` script cannot use it.
The script creates a service-role client directly, the same way the tests do.
Instead of: relaxing the `server-only` guard, which exists to enforce Never rule 4.

## 2026-08-24 — Dependency added in slice 01
Because (rule 10): `tsx` (dev) — runs `scripts/seed-check.ts` as TypeScript with
the `@/` path alias resolved; the slice spec names `npx tsx` as the command, and
pinning it locally means it is not re-downloaded on every run.

## 2026-08-24 — `app/globals.css` is the token file, and the only file with a hex in it
Because: rule 7 needs somewhere to point at. Tailwind v4 is CSS-first, so the
tokens have to be CSS custom properties anyway; making that same file the single
source means "is this colour allowed?" is answered by one `grep`.
Instead of: a `lib/tokens.ts` generating CSS, which is two files that can
disagree and a build step to keep them agreeing.

## 2026-08-24 — Dark mode is a duplicated token block, not `light-dark()`
Because: `/styleguide` shows both themes side by side, which means a nested
element must be able to override its ancestors' theme. `light-dark()` would be
one copy instead of two, but Tailwind's Lightning CSS polyfills it for its
browser targets and the polyfill's behaviour in a nested subtree is not
something to bet the whole colour system on. Two plain blocks — one for
`prefers-color-scheme`, one for `data-theme="dark"` — always work. A test
asserts the two copies are byte-identical, so they cannot drift.
Instead of: `light-dark()` (clever, and clever is a bug), or a class-based
`.dark` strategy that needs a script in `<head>` to avoid a flash.

## 2026-08-24 — Tailwind's default colour palette and type scale are deleted
Because: `--color-*: initial` and `--text-*: initial` in `@theme` mean
`bg-blue-500` and `text-xl` do not exist to be typed by accident in slice 09 at
midnight. DESIGN.md says the scale is `12 · 13 · 14 · 16 · 20 · 26 · 34` and
"nothing between"; deleting the rest is what makes that true rather than
aspirational. Sizes are named for their pixels (`text-16`) because that is the
unit DESIGN.md is written in.
Instead of: adding our tokens alongside the defaults and relying on everyone
remembering which half is ours.

## 2026-08-24 — Colour utilities are `text-ink` / `text-muted` / `text-faint`
Because: `--text-muted` maps to `text-muted` cleanly, but `--text` would map to
`text-text`, which reads like a typo and will be mistyped. `ink` is the one
rename in the system, and `/styleguide` lists every token beside its utility so
it is discoverable without reading this file.
Instead of: `text-text`, or `text-foreground`, which is a word from a different
design system.

## 2026-08-24 — Course colours are not registered with Tailwind
Because: DESIGN.md's rule is that a course colour appears as a 3px rail, an 8%
tint, or a small dot, and never as text or a saturated fill. If `bg-course-teal`
existed, a later slice would use it and the calendar would become a fruit salad.
The eight are plain CSS variables reachable only through `courseRail`,
`courseTint` and `courseDot` in `lib/course-colours.ts`, and those return the
variable, never a hex.
Instead of: eight entries in the Tailwind palette, which is more convenient and
exactly the convenience that breaks the rule.

## 2026-08-24 — `courseTint` uses `color-mix`, not `rgba(R,G,B,.08)`
Because: the literal `rgba()` form needs the channels, which would put the eight
hexes into TypeScript and break rule 7. `color-mix(in srgb, var(--course-x) 8%,
transparent)` is the same colour without knowing them. Support matches the
browser targets Tailwind v4 already compiles for.
Instead of: a hex-to-rgba helper in app code, i.e. a second place colours live.

## 2026-08-24 — `--control-height` is 32px, or 44px on a coarse pointer
Because: DESIGN.md asks for both — "buttons: 32px high" and "tap targets: 44px
minimum on touch". A `@media (pointer: coarse)` override on the token satisfies
both without a single component knowing which device it is on.
Instead of: picking one number and being wrong on the other device, or a
`size="touch"` prop every call site has to remember.

## 2026-08-24 — Font sizes are in px, not rem
Because: DESIGN.md is written in px, including a hard floor ("never smaller than
12px anywhere") that only means something in px. The trade-off is real — px
ignores the browser's font-size setting — and is accepted for a single-user app
whose author wrote the spec.
Instead of: a rem scale that silently renames every number in the design doc.

## 2026-08-24 — `/styleguide` 404s outside development, and is public inside it
Because: it is a developer tool, not a screen, so it should not ship. But the
definition of done is checking it on a phone, and the phone is not signed in —
so `proxy.ts` lets it through without a session. It renders no data and no user,
and in production there is nothing there to let through.
Instead of: leaving it behind auth (the phone check needs a magic link first),
or shipping it publicly (a page nobody asked for, on the internet).

## 2026-08-24 — `cx()` instead of `clsx` + `tailwind-merge`
Because: it is six lines. Merge semantics also encourage primitives that set
opinionated defaults and quietly fight their callers; without them, the
primitives are pushed to set only classes a caller will not want to override,
which is the "unstyled-by-default" the slice asked for.
Instead of: two dependencies for string joining.

## 2026-08-24 — No dependencies added in slice 02
Because (rule 10): none were needed. Geist, Geist Mono and Source Serif 4 all
come from `next/font/google`, which ships with Next. The primitives are ~20
lines each, per the slice's "do not install a UI kit".

## 2026-08-24 — The signed-in screens live in an `(app)` route group
Because: the shell — sidebar, bottom nav — belongs to every page behind auth
and to none of the pages in front of it. A route group gives those pages one
layout without changing a single URL, so `/login` and `/styleguide` keep
rendering bare. `app/today/page.tsx` moved to `app/(app)/today/page.tsx` and
is still `/today`.
Instead of: putting the nav in the root layout and hiding it on two paths,
which means the login screen ships markup it never shows.

## 2026-08-24 — `/today`'s arithmetic lives in `lib/today.ts`, not in the page
Because: "which class am I in", "what is late" and "which local day is this
deadline on" are the only things on this screen that can be wrong, and a
Server Component that reads Supabase cannot be unit-tested. The page is left
with fetching and markup; `lib/today.test.ts` covers the rest and needs no
database.
Instead of: inlining the comparisons in the page, where the timezone bug that
files a Wednesday deadline on Tuesday would only be found in November.

## 2026-08-24 — Overdue looks back 30 days, not forever
Because: the tasks module can only answer "due between these two dates", and
"everything still open from any date" is a different query. Thirty days is far
enough back to catch the essay from last month and short enough that /today
does not open onto four months of guilt — a Today page that feels like a
graveyard stops being opened, which costs more than a forgotten task.
Instead of: an unbounded lookback (a screen that only grows) or no overdue
section at all (the one thing that genuinely needs to shout).

## 2026-08-24 — "Now" and "Next" are the third place the accent appears
Because: DESIGN.md reserves `--accent` for "something needs attention" and the
now-line. The `Now` pill on today's current class *is* the now-line on a
screen that has no grid to draw it across, and the overdue header is the
plainest possible case of something needing attention. Everything else on the
page — including `Next` — is neutral.
Instead of: inventing a fourth colour for "current", which would start the
slide back towards a school portal.

## 2026-08-24 — One class is highlighted, never two
Because: `classStates` marks the class that is running, or — only when none
is — the one starting next. Two highlights is no highlight. A cancelled class
is never the one marked, because it is not somewhere to be.
Instead of: marking both "now" and "next", which on a day with back-to-back
lectures highlights half the list.

## 2026-08-24 — PWA colours live in `public/manifest.json` and are read back from it
Because: rule 7 says a hex outside `app/globals.css` is a bug, and
`lib/design-tokens.test.ts` enforces it across `app`, `components`, `lib` and
`modules`. A web app manifest genuinely needs literal colours, and it is
browser chrome rather than app source, so `public/` is where it goes;
`app/layout.tsx` imports the JSON for its `<meta name="theme-color">` rather
than repeating the values. The non-standard `theme_color_dark` key is ignored
by browsers and exists so the dark status bar has one home too.
Instead of: `app/manifest.ts` (Next's convention, but a `.ts` file full of
hexes inside `app/`), or hardcoding the colour twice.

## 2026-08-24 — The icons are generated by a script, not drawn in a design tool
Because: four PNGs is not a reason to add `sharp`, and the mark is three
rounded bars — a hand-rolled PNG encoder over Node's `zlib` is about sixty
lines and has no dependency. `scripts/make-icons.mjs` is checked in so the
mark can be changed later without a design tool. `scripts/` is outside the
directories rule 7's test scans, which is correct: an icon is a binary asset,
not a component.
Instead of: committing four PNGs from nowhere, or installing an image library
to produce them once.

## 2026-08-24 — `/manifest.json` is public in `proxy.ts`
Because: browsers fetch the manifest without credentials, so behind the auth
redirect it comes back as the login page and the app is not installable. It
contains four URLs and an icon list; there is nothing in it to protect.
Instead of: `crossorigin="use-credentials"` on the manifest link, which works
but makes installability depend on a valid session.

## 2026-08-24 — On Vercel the timezone comes from the `TZ` environment variable
Because: `localTimeZone()` reads the machine's zone, which is right on a
laptop and is UTC on a serverless function — so "today" would end at 04:00
local. Setting `TZ=Asia/Dubai` in the Vercel project makes
`Intl.DateTimeFormat().resolvedOptions().timeZone` return it, and no code
changes. It stays a fact about this term, not about the code (see the earlier
decision on explicit timezones).
Instead of: a `NEXT_PUBLIC_TIME_ZONE` env var validated in `lib/env.ts`, which
is a second way to say the same thing, or reading the zone in the browser,
which costs the instant first paint the slice exists for.

## 2026-08-24 — `colourForCourse` falls back to the palette by position
Because: `courses.colour` is nullable and a course typed straight into the
Supabase table editor has none, but every course still has to look like
something. Courses are listed ordered by code, so the fallback is stable
between renders. It lives in `lib/course-colours.ts` beside the three ways a
course colour may be drawn, because slice 04 needs the same answer.
Instead of: a grey default (colour identifies a course; a colourless course is
a course you cannot find), or picking the fallback in each screen.

## 2026-08-24 — No dependencies added in slice 03
Because (rule 10): none were needed. The nav icons are four inline SVGs, the
PWA icons come from a script over Node's `zlib`, and everything on the page is
built from the slice-02 primitives.

## 2026-08-24 — The calendar's arithmetic lives in `lib/calendar.ts`
Because: four things on this screen can be silently wrong and none of them can
be tested through a Server Component — the auto-cropped hour range, the 5-vs-7
column detection, where a block sits in a day, and which blocks have to share a
column. They are pure functions over instants, so they move out of the
components and get `lib/calendar.test.ts` around them, exactly as `/today`'s
arithmetic moved to `lib/today.ts` in slice 03.
Instead of: computing positions inline in the grid, where the week that
renders 00:00–23:59 is only found by looking at it.

## 2026-08-24 — The calendar is one client component over a wide server window
Because: docs/DESIGN.md says "changing week or day must never show a loading
state" and "prefetch neighbours". The page fetches ten weeks either side of the
cursor — a few hundred rows — and hands them down, so every arrow key, swipe
and view switch is instant with no round trip at all, which is stronger than
prefetching. Stepping outside that window is the only thing that asks the
server again, and the current screen stays up while it does. The views below
the shell are presentational and take props.
Instead of: a Server Component per week (a round trip per arrow key), or
route-level prefetching (a round trip that is merely early).

## 2026-08-24 — 'auto' is a fourth view, resolved in CSS not in JavaScript
Because: week is the desktop default and day is the mobile default, which makes
"which view" a question about the viewport. Answering it with `matchMedia`
during render means either a wrong first paint or a hydration mismatch. So
before the user picks, both views are rendered and `hidden md:block` /
`md:hidden` decide — right on the first frame, on either device. The subtitle
and the highlighted tab are decided the same way. Where an event handler needs
to know which one is showing (arrow keys, swipe), it asks the DOM: the week
wrapper is hidden, so it has no `offsetParent`.
Instead of: a viewport check in JavaScript, or defaulting to one view
everywhere and making the other device switch every time.

## 2026-08-24 — The clock is `useSyncExternalStore`, not `useState` in an effect
Because: the now-line has to update every minute without the server rendering a
time it cannot know. A store whose server snapshot is `null` renders no
now-line in the HTML and swaps the real one in after hydration — no mismatch,
and no `setState` in an effect body (which the lint rule now rejects outright).
Instead of: `useState(null)` plus a mount effect, which is the same behaviour
with a cascading render and a lint error.

## 2026-08-24 — Dragging a lecture marks it `moved`
Because: a dragged lecture no longer matches its weekly pattern, and the next
`generateMeetings` run would drag it straight back. `isHandEdited` already
protects any meeting whose `status` is not `scheduled`, so setting `moved` is
the whole fix and needs no new column. A cancelled lecture that is dragged
stays cancelled. `modules/courses/meeting-edits.test.ts` is the test.
Instead of: clearing `session_id` (which would lose the link to the pattern the
lecture came from), or a new `hand_edited` boolean duplicating what `status`
already says.

## 2026-08-24 — The reading column moved into an `(app)/(narrow)` route group
Because: `/calendar` is a grid and five day columns need more than the 42rem a
page of text should ever be. A child cannot widen a max-width its parent set,
so the constraint moved down one level into a route group — `/today`, `/notes`,
`/review` and `/settings/*` are in `(narrow)` and get the column for free,
`/calendar` sits beside it and sets its own. No file's contents changed and no
URL changed, which is why this was the option chosen over editing three pages
outside the slice (rule 9).
Instead of: a `has-[]` variant on the shared layout (clever, and clever is a
bug), or removing the wrapper and adding one to every page.

## 2026-08-24 — The auto-crop wins over the now-line
Because: DESIGN.md calls a grid full of empty night hours "the single most
common way this screen goes wrong", and the crop is the fix. On a day whose
last class ends at noon, that means the grid stops at 13:00 and the now-line at
18:20 is simply not drawn. Stretching the range to reach the current time would
undo the crop on exactly the light days it helps most.
Instead of: always including "now" in the range, which turns a two-class
Tuesday back into a wall of empty hours.

## 2026-08-24 — Drag to move and resize is mouse-only
Because: on a phone the day view is the default and a class is edited by
tapping it open; a drag handler that accepted touch would turn every attempt to
scroll the grid into an accidental reschedule. `event.pointerType !== 'mouse'`
is one line and removes the whole class of problem.
Instead of: long-press-to-drag, which is a gesture to learn and a timer to get
wrong, for an interaction the week grid (a laptop screen) already covers.

## 2026-08-24 — A tap on a class opens a sheet, not the lecture page
Because: DESIGN.md says a class taps through to the lecture page, and that page
is slice 05. The sheet carries the header the lecture page will have — code,
name, date, time, room, cancelled state — plus the one-tap cancel this slice
owes, and becomes a link when there is somewhere to link to.
Instead of: shipping a dead route now, or leaving classes unclickable and
having no home for "cancel this class".

## 2026-08-24 — Block detail is chosen by duration, not by measured height
Because: DESIGN.md says "under ~80px tall, drop the course name", and the hour
row is 80px — so ~80px tall *is* one hour. Writing the rule as a duration keeps
the pixel out of the components and lets `blockDetail` be a pure function with
a test, rather than something that has to measure itself after layout.
Instead of: a ResizeObserver on every block, which is a measurement pass per
class per render to learn something the start and end times already say.

## 2026-08-24 — The date strip's dots are course colours, not the accent
Because: DESIGN.md's Measurements section asks for "a 4px accent dot under any
day with classes", but its Neutrals section says the accent appears in exactly
two places and a class is not one of them — and the month view, one section
above, uses course-colour dots for exactly the same job. Course colours make
the strip and the month grid say the same thing the same way, and keep the
accent meaning "this wants you". Flagged below for a ruling.
Instead of: an accent dot (four places the accent now appears, and a strip that
disagrees with the month view), or guessing silently.

## 2026-08-24 — 12px is the floor in the calendar too
Because: DESIGN.md's Measurements section specifies 12.5px course names,
11.5px room/time and 11px gutter labels, and its Type section says never
smaller than 12px. Slice 02 settled that contradiction in favour of the floor
and built `text-12` as the smallest size on the scale (plus `text-label` at
11px for uppercase mono labels only). The calendar follows the built tokens:
code, name, room, time and gutter are all `text-12`; the uppercase weekday and
"DUE" labels are `text-label`.
Instead of: adding `text-12_5` and `text-11_5` tokens for two numbers that
contradict the rule the scale was built to enforce.

## 2026-08-24 — No migration and no dependencies in slice 04
Because: `class_meetings` already has every column this screen needs — slice 01
built it — and the grid is hand-rolled per the earlier decision, so there was
nothing to install. `--week-hour-height` and the rest of DESIGN.md's calendar
measurements went into `app/globals.css` beside the other tokens, because rule
7 says a component may not carry a raw value.

## 2026-08-24 — `plainTextOf` walks the TipTap document instead of stringifying it
Because: the staleness invariant hashes a block's *meaning*, not its markup.
Walking the node tree and concatenating only `text` nodes (inline children run
together, block children get a line break between them) means bold, italic,
code marks and a heading-level change never touch the hash — only the words
do. Stringifying the JSON instead would make every formatting keystroke look
like a rewrite and stale every derivation downstream for nothing. The plain
`{ text: string }` shape every earlier slice writes is still read as-is, so
slice 05 does not touch a single existing block. Proven by
`modules/recalc/tiptap-staleness.test.ts` against the real cascade trigger:
reordering nodes and bolding a word stale nothing; changing a word bumps the
version and stales the derivation, exactly as `staleness.test.ts` already
proved for plain blocks.
Instead of: hashing the TipTap JSON directly, which is simpler but wrong — see
above — or building a rich-document differ before slice 05 needed one.

## 2026-08-24 — A note document is one `blocks` row of type `note`; its paragraphs are its children
Because: blocks are already the single primitive with identity, versioning and
provenance (see the first decision in this file) — a note is not a new kind of
thing, it is TipTap's document shape spread across the parent/child structure
`modules/blocks` already has. Each top-level TipTap node becomes one child
block, so a derivation can cite the paragraph it read rather than the whole
document, and reordering paragraphs is a position change with no version bump
(`modules/blocks/document.test.ts`).
Instead of: one block holding the entire TipTap document as opaque JSON, which
would make every keystroke anywhere in the document bump the same version and
make per-paragraph provenance impossible.

## 2026-08-24 — `standalone_notes` indexes free-standing notes only; a lecture note is found through `class_meetings.note_block_id`
Because: there are two kinds of note and each already has an authoritative
place to be found — a lecture note through the meeting it belongs to, a
free-standing note (a formula sheet, a reading plan) through nothing, which is
exactly what migration 003 adds. Indexing lecture notes a second time here
would create two sources that could disagree about the same document.
Instead of: one `notes` table for both kinds, which needs a nullable
`meeting_id` and a rule about which field wins when both are set.

## 2026-08-24 — Dependencies added in slice 05
Because (rule 10, one line each):
`@tiptap/react` — the stack's named editor, React bindings.
`@tiptap/starter-kit` — the paragraph/heading/list/mark set DESIGN.md's note
screens need, as one bundle instead of assembling each extension by hand.
`@tiptap/pm` — ProseMirror types `@tiptap/react`'s API is built on; needed to
type the document JSON this slice hashes and stores.
Instead of: nothing controversial; TipTap/ProseMirror is named in CLAUDE.md's
stack table.

## 2026-08-24 — `createStandaloneNote` verifies `courseId` against the caller's workspace before inserting
Because: `workspaceId` is derived server-side from the session on every call,
but `courseId` is client-supplied form data, and the `standalone_notes` insert
policy only validates `workspace_id` — not the `course_id` it references. The
same gap was found and fixed in slice 04's `createOneOffMeeting` (see the
security-fix commit between slices 04 and 05); this slice repeats the same
shape, so it gets the same check: a `getCourse(workspaceId, courseId)` lookup
before the row is written, mirroring `setMeetingUnit`'s existing cross-course
check for syllabus units.
Instead of: relying on RLS alone, which is a correct backstop for `workspace_id`
but was never asked to prove `course_id` belongs to that workspace too.

## 2026-08-24 — Every client-supplied id in `modules/tasks` is proved before it is written
Because: this is the third slice in a row where a write takes a foreign id from
the browser, and the first two both shipped the bug (`createOneOffMeeting` in
04, `createStandaloneNote` in 05 — see the entries above). A task takes four at
once: `courseId`, `unitId`, `meetingId` and `sourceBlockId`. So the check is not
repeated per call site — one `checkLinks` in `tasks.service` runs on `createTask`
*and* `updateTask`, proves the course is this workspace's, the lecture is this
workspace's *and* belongs to that course, the unit belongs to that course, and
the source block is this workspace's. A caller cannot forget it because no
caller performs it. `modules/tasks/task-sources.test.ts` asserts all six refusals
against the real database with the service-role key, which bypasses RLS — so the
test proves the *service* refuses, not merely that Postgres would have.
Instead of: a check per server action (four actions, four chances to forget), or
relying on RLS, which is a correct backstop for `workspace_id` and was never
asked to prove anything about the ids that row points at.

## 2026-08-24 — `getOverdueTasks` has no lookback window, and /today now uses it
Because: docs/DECISIONS.md capped /today's overdue section at 30 days purely
because the tasks module could only answer "due between these two dates". It can
answer the real question now — `status in (open, doing) and due_at < now` — so
the workaround is gone. The page makes two reads instead of one, because they
are two different questions: a seven-day window forwards, and everything late
backwards. The essay from April shows up again, which is the point.
Instead of: keeping the window (a screen that quietly loses things), or widening
it to a year (the same bug with a bigger number).

## 2026-08-24 — A task is deleted for real, unlike a block
Because: nothing is ever derived *from* a task, so there is no provenance for a
tombstone to protect — which is the whole reason `softDeleteBlock` exists.
`dropped` remains the status for "decided not to do this" and keeps its history;
delete is for a task that was never real. The sheet says exactly that.
Instead of: soft-deleting tasks too, which would mean every read carrying a
`deleted_at is null` filter to hide rows nothing will ever cite.

## 2026-08-24 — Filters on /tasks are links, not client state
Because: a filter is a fact about which page you are looking at. As `?f=` and
`?c=` it survives a refresh, can be bookmarked, back works, and the whole screen
stays a Server Component — no JavaScript at all is needed to change what is
shown. The list is fetched once and narrowed by `filterTasks` in `lib/tasks.ts`,
which is a pure function with tests, exactly as `/today` and `/calendar` keep
their arithmetic out of the components.
Instead of: `useState` over a client-side list (a screen that forgets what you
were looking at every time you complete something), or a server round trip per
row, which is what a per-filter query would have been anyway.

## 2026-08-24 — The shorthand parser reads only the *end* of the line, and never the whole of it
Because: the failure mode of quick add is eating half a title. So it consumes at
most one date and one time, only as a suffix, only when at least one word would
be left over ("friday" alone is a task called "friday"), and it refuses a bare
number outright — "Read chapter 5" must not become "Read chapter" due at 05:00.
Short joining words directly in front of a recognised date are dropped, because
"hand in the essay by friday" is how a person types. What it understood is
rendered under the box before anything is saved, per the slice's own
instruction, and `lib/task-shorthand.test.ts` has a whole describe block named
for what it refuses to invent.
Instead of: a date library and a permissive grammar, which would parse more and
be trusted less — and would need a dependency (rule 10) to be wrong in more ways.

## 2026-08-24 — Parsing happens in the browser, and the resulting instant is sent to the server
Because: "fri 5pm" means five in the evening where the person typing it is
standing. Parsing in the browser is the only place that fact is known for free,
and it makes the preview instant. The server receives an ISO instant and never
re-interprets it. The edit sheet's date and time fields are the one exception —
they post `YYYY-MM-DD` and `HH:MM` and are combined server-side, so they follow
`TZ` like every other date on these screens (see the Vercel `TZ` decision above).
Instead of: posting the raw string and parsing it on the server, which would put
the deadline in Vercel's timezone, or shipping a timezone in the payload, which
is a second source of truth about the same thing.

## 2026-08-24 — "Make a task from this" flushes the note's pending save first
Because: the editor mints a block id the moment a paragraph is typed, but the
`blocks` row only exists after the debounced save lands ~900ms later. A task made
from a sentence typed five seconds ago would otherwise name an id that is not in
the database yet, and `checkLinks` would — correctly — refuse it. Awaiting the
flush before opening the sheet is the difference between the link resolving and
the write being rejected for a reason the user cannot see.
Instead of: skipping the ownership check for source blocks (which is the bug
this slice exists not to repeat), or creating the block eagerly on every
keystroke.

## 2026-08-24 — `NoteEditor` takes an optional `makeTask` callback and still knows nothing about tasks
Because: the editor's contract from slice 05 is that it holds no knowledge of
lectures, courses or the database. Selection-to-task keeps that: the editor
hands back the selected words and the id of the block they sit in, and the page
underneath fills in the course, the unit and the lecture — server-side, from the
row it just read, so those three are not client-supplied at all. Omit the prop
and the button is not drawn.
Instead of: passing course lists into the editor (which would make it know about
courses), or wrapping it in a second client component just to own a sheet.

## 2026-08-24 — `getNoteRefs` lives in `modules/notes`, not `modules/tasks`
Because: "where does this block live, and what is the URL" is a question about
notes. The notes module already holds both halves of the answer — a lecture note
is found through `class_meetings.note_block_id`, a free-standing one through
`standalone_notes` — and duplicating that resolution inside tasks would create a
second place that can disagree about the same document. It is batched (one call
per page, not one per row) because /tasks asks it for a whole list.
Instead of: `modules/tasks` importing `modules/notes` to build a href, which
inverts which module owns the fact.

## 2026-08-24 — `Input` / `Textarea` / `Select` / `Field` land in `/components/ui`, and three screens stop styling inputs inline
Because: docs/DECISIONS.md's "Noticed, not fixed" booked this for slice 06 by
name — the first slice with a real form. The add-a-one-off sheet,
`/settings/semester` and `/notes` each carried their own copy of the same
`FIELD` string; all three now import the primitive, and `/styleguide` shows it
beside the others. The controls share `--control-height` with `Button`, so a
form and its submit button line up and both grow to 44px on a touch screen.
Instead of: a fourth copy of the string in this slice's four new forms.

## 2026-08-24 — The mobile bottom nav goes to five columns
Because: /tasks is a top-level destination and has to be reachable. An earlier
note in this file said a fifth entry "would break" the four-column grid; at
390px five columns is 78px each, which comfortably fits a 20px icon above a
one-word label. Measured rather than assumed. A *sixth* would not fit, so
`/settings/*` still stays out of the nav — that note stands.
Instead of: replacing the unbuilt "Review" entry (it is slice 11 and its route
already exists), or leaving /tasks reachable only by typing the URL.

## 2026-08-24 — No migration and no dependencies in slice 06
Because: `tasks` already has every column this slice needs — slice 01 built it
with `course_id`, `unit_id`, `meeting_id`, `due_at`, `status` and
`source_block_id`, and RLS was enabled with four policies at the same time. The
one measurement the screens needed that DESIGN.md does not specify,
`--check-size`, went into `app/globals.css` beside the other tokens, because
rule 7 says a component may not carry a raw value. Nothing was installed: the
shorthand parser is regexes over tokens rather than a date library.

## 2026-08-26 — The timer is two instants in `localStorage`, never a countdown
Because: prompts/07-focus.md's third point is the whole slice — "store the start
time, not a countdown... do not rely on a `setInterval` staying alive". A
`Timer` is `{ startedAt, pausedAt, pausedMs }` and nothing else; every question
the screen asks (how long is left, is it done, how many minutes to log) is a
pure function of those three and `Date.now()`, in `lib/pomodoro.ts`, with its
own test. The interval in `focus-timer.tsx` only repaints digits — kill it,
freeze the tab, lock the phone for twenty minutes, and the answer on return is
still right. `localStorage` rather than React state so a refresh, a back button
or a second tab all find the same block still running.
Instead of: a `setInterval` decrementing a number in state (wrong the moment the
tab is backgrounded), or a row in the database written at start and updated at
the end (a network round trip in the way of pressing Start, and a table full of
half-finished sessions when the phone never comes back).

## 2026-08-26 — A `study_sessions` row is written only once the block is over
Because: `ended_at` is then `not null` for every row, so "how many minutes" is a
plain sum with no open sessions to exclude and no clock-skew arithmetic on read.
It also means the table never holds a session that did not happen. The cost is
that a block abandoned mid-way logs nothing, which is the right answer: below
`MIN_LOGGABLE_MS` (one minute) `loggableSpan` returns null and the block is
thrown away rather than logged as a minute of nothing.
Instead of: inserting on Start and updating on Stop, which needs a nullable
`ended_at`, an "is it still running" state in the database, and a rule for what
to do with the ones that never ended.

## 2026-08-26 — `logStudySession` is idempotent on (workspace, `started_at`), with a unique index behind it
Because: the browser decides when to write the row, and there are three ordinary
ways for it to ask twice — a second tab with the same block in `localStorage`, a
double tap on Stop, a request the browser retried after a flaky connection. Any
of them would turn one 25-minute block into 50 logged minutes, and minutes are
the entire output of this slice. The service returns the row it already wrote;
`study_sessions_workspace_started_at_key` is the backstop that holds even if a
future caller forgets to go through the service.
Instead of: a client-generated idempotency key (one more thing the browser can
get wrong) or trusting that the UI only ever calls once.

## 2026-08-26 — `ended_at` is the moment the block *would* have ended, not wall-clock stop time
Because: `ended_at - started_at` is then exactly the focused duration, which is
what every query in `modules/study` sums. A block paused for a ten-minute coffee
would otherwise count the coffee as thermodynamics. `loggableSpan` subtracts
paused time once, in `lib/pomodoro.ts`, and the server re-checks the result:
under a minute is refused, over `FOCUS_MINUTES` is refused, because both
instants arrive from a browser and neither is trusted.
Instead of: storing a separate `paused_ms` column (a second number that can
disagree with the first two), or trusting the client's own minute count.

## 2026-08-26 — `modules/study` runs slice 06's `checkLinks` on every write
Because: `workspaceId` is never forgeable — every caller re-derives it from the
session — but `courseId` and `unitId` come from two `<select>`s in the browser,
and the `study_sessions` RLS policy only validates `workspace_id`. It was never
asked to prove the course a row points at belongs to that workspace too. Three
bugs of exactly this shape were found in slices 04, 05 and 06. One shared
`checkLinks` inside the service means no call site can forget it, because no
call site performs it. `modules/study/study-sessions.test.ts` asserts a foreign
`courseId` and a foreign `unitId` are both refused and that nothing is written
while refusing — with a service-role client, which bypasses RLS, so the check
being in the service is the only reason those tests pass.
Instead of: checking in the server action (one call site today, two tomorrow),
or leaning on RLS, which cannot see the relationship between two tables.

## 2026-08-26 — /focus is reached from the /today strip, not from a sixth nav column
Because: the 2026-08-24 entry above measured the mobile bottom nav and recorded
that five columns fit at 390px and "a *sixth* would not fit". That measurement
did not change this week, and the sidebar and the bottom bar deliberately render
one list so they cannot drift apart — so adding Focus to one means adding it to
both. A timer is also not a place you browse to: you start it from the page you
already opened at 7:45am, which is /today, and the strip that shows the minutes
is the natural door to the thing that produces them. The precedent is
`/settings/semester`, reachable from the calendar header for the same reason.
Instead of: cramming a sixth 65px column onto a phone, dropping the unbuilt
"Review" entry (slice 11 owns it and its route already exists), or leaving
/focus reachable only by typing the URL.

## 2026-08-26 — /today's strip shows exactly two numbers: minutes today and minutes this week
Because: prompts/07-focus.md caps it — "do not build a stats dashboard. Two
numbers on /today is enough for now" — and docs/DESIGN.md's "What not to build"
already rules out statistics, streaks and charts. `getMinutesOnDate` and
`getMinutesThisWeek` are the two reads; both go through `lib/study`'s pure
`formatMinutes`, so '1h 25m' is spelled one way everywhere. The week starts on
Monday because `lib/calendar`'s `WEEK_STARTS_ON` says so, and two screens
disagreeing about which week it is would be worse than either answer. The strip
sits under the header rather than at the foot of the page so the way in to
/focus is visible without scrolling; /today's two real questions keep their
order below it.
Instead of: a per-course breakdown or a bar chart (`getMinutesThisWeekPerCourse`
exists for slice 12's use, and is deliberately not rendered anywhere yet).

## 2026-08-26 — The per-unit aggregation is done in memory over pure functions
Because: `lib/study.ts` holds `sessionMinutes`, `minutesByCourse`,
`minutesByUnit` and `formatMinutes` as plain functions over spans, with their
own test and no database in sight — the same split as `lib/today.ts`,
`lib/calendar.ts` and `lib/tasks.ts`. At one student's scale that is a few
thousand rows a year and one query, and the arithmetic that can be silently
wrong is the part that is tested. Three indexes on `study_sessions` are there to
push it into SQL on the day that stops being true.
Instead of: a Postgres view or `group by` in the repo, which would put the
product's central claim — minutes per unit — somewhere no unit test can reach.

## 2026-08-26 — One migration, no dependencies, in slice 07
Because: `004_study.sql` creates `study_sessions` exactly as docs/SCHEMA.md
specified it (this was the "Noticed, not fixed" item saying slice 01 skipped
it), with RLS enabled and four policies in the same file. Nothing was installed:
the timer is arithmetic on `Date.now()`, and the clock face is `padStart`.

## 2026-08-26 — Syllabus units are renumbered 1..n on every reorder, not fractionally indexed
Because: `syllabus_units.position` is described in migration 002 as "fractional
index, same convention as blocks", and that convention is right for a note
document with a thousand paragraphs. A syllabus is fifteen lines that a person
reads as "unit 1, unit 2, unit 3" — the number *is* part of what a unit is. So
`reorderSyllabusUnits` rewrites the whole list as 1..n and only writes the rows
whose position actually moved, which makes "positions are 1..n, distinct, in
list order" a property that holds after every single move instead of a hope.
`moveSyllabusUnit` at either end of the list is a no-op that still renumbers, so
a course seeded by hand into the Supabase table editor with duplicate positions
straightens itself out the first time an arrow is pressed.
Instead of: midpoint insertion (positions drift to 1.0078125 and the screen has
to renumber for display anyway), or a unique index on `(course_id, position)` —
which cannot be added while each `update` is its own transaction, because a swap
transiently collides. The permutation check in the service is the guard instead,
and `modules/courses/syllabus-units.test.ts` asserts the property after every
move rather than only at the end.

## 2026-08-26 — Every syllabus write proves the course through the unit's own row
Because: `syllabus_units` carries no `workspace_id` — ownership flows through
`course_id`, exactly as its RLS policies in migration 002 do. So a caller who
sends only a unit id is sending an id that RLS *would* catch but the service
must catch too, since the service-role key bypasses RLS entirely. `ownedUnit`
reads the unit first and checks the `course_id` it actually has, so nothing the
browser said about which course a unit belongs to is ever believed. This is the
same answer slices 06 and 07 reached with `checkLinks` in `modules/tasks` and
`modules/study`, for the fourth and fifth time in a row: the check is inside the
module, so no call site can forget it because no call site performs it.
Instead of: checking in the four server actions (four chances to forget), or
trusting RLS, which cannot see the relationship between two tables and is not
even in the picture for a service-role caller.

## 2026-08-26 — The status chip cycles on one tap, and progress is a count rather than a percentage
Because: prompts/08-syllabus.md asks for status "set by me in one tap" and for
progress "honest about what it measures — units marked comfortable or better,
not a fake percentage". The four statuses are ordered weakest-first, so one tap
advancing along them (and wrapping from `mastered` back to `not_started`) is
both one tap and meaningful; a four-chip row per unit would be sixty buttons on
a fifteen-unit syllabus, and a `<select>` is two taps. Progress reads "6 of 14
comfortable or better · 4 never opened", because "43%" sounds like a measurement
of how much of the course I know when it is a count of boxes I ticked myself.
`nextUnitStatus` is computed in the browser and posted as a hidden field so the
button's label and its effect cannot disagree; `setSyllabusUnitStatus` validates
it against the enum regardless.
Instead of: inferring status from minutes or lectures attended, which is the AI
this slice explicitly does not have — and would make the one honest number in
the app a guess.

## 2026-08-26 — "Never opened" means no minutes, no notes, no tasks and an untouched status
Because: prompts/08-syllabus.md's definition of done is "see at a glance which
units I have never opened", and `status = 'not_started'` alone does not mean
that — a unit with three hours logged against it and two tasks open has plainly
been opened, whatever its chip says. `rollUpUnits` requires all four to be empty
before it calls a unit untouched, and those rows render in `--text-faint` with
the words "Never opened" where the other rows show their minutes. The accent is
deliberately not used: docs/DESIGN.md reserves it for "something needs
attention" and the now-line, and a syllabus unit is not an alarm.
Instead of: colouring untouched units with the accent (four places the accent
now appears, and a syllabus that shouts on the day it is typed in), or reading
the status alone (which would call a unit you have studied for hours "never
opened" until you remember to tap the chip).

## 2026-08-26 — The course page is server-rendered; only the cursor needs a client component
Because: the status chip and the two reorder arrows are three submit buttons in
one plain `<form>`, so changing a status or moving a unit works with no
JavaScript at all — and only the clicked button's name and value are posted, so
a move and a status change can never be confused. The two things a `<form>`
genuinely cannot do are keep the cursor in the add box after each unit is added
and save a rename without a visible save button, so those are the only two
`'use client'` files: `components/syllabus/add-unit.tsx` and
`components/syllabus/unit-title.tsx`, both leaf-level and about twenty lines.
That is what makes "type, enter, type, enter" true while typing a syllabus in
from a PDF.
Instead of: drag-and-drop reordering (unusable one-handed on a phone, and a
dependency), or one big client component owning the whole syllabus (which would
ship the list twice and lose the instant first paint).

## 2026-08-26 — `NoteListEntry` gained a `unitId`, and the unit rollup happens in memory
Because: a unit has to be able to list the notes attached to it, and there are
two kinds of note with two different homes for that fact — a lecture note takes
its unit from `class_meetings.unit_id` (the one-tap topic picker built in slice
05), a free-standing note from `standalone_notes.unit_id`. `listNotes` already
reads both, so it is the one place that can answer the question without a second
source that could disagree. The rollup itself — minutes, notes, tasks and open
tasks per unit — is `rollUpUnits` in `lib/syllabus.ts`: a pure function over
plain shapes with its own test, the same split as `lib/today.ts`,
`lib/calendar.ts`, `lib/tasks.ts` and `lib/study.ts`.
Instead of: a `getNotesForUnit` in `modules/notes` and a `getTasksForUnit` in
`modules/tasks` (two more workspace-wide reads for the same three lists the page
already has), or doing the counting inside a Server Component where no unit test
can reach it.

## 2026-08-26 — /courses is reached from the calendar header, not from a sixth nav column
Because: the 2026-08-24 entry above measured the mobile bottom nav and recorded
that five columns fit at 390px and "a *sixth* would not fit", and slice 07
followed the same measurement for /focus. The precedent is
`/settings/semester`, which has been reached from the calendar header since
slice 04 for exactly this reason. So `/courses` sits beside it there, the
semester settings' course rows became links to it, and the lecture page's Topic
section links to the syllabus it is picking from — three doors, all from screens
that already had a course on them.
Instead of: cramming a sixth column onto a phone, or leaving the syllabus
reachable only by typing a UUID into the address bar.

## 2026-08-26 — No migration and no dependencies in slice 08
Because: `syllabus_units` already has every column this slice needs —
migration 002 built it with `position`, `title`, `status` and `block_id`, RLS
enabled and four policies flowing ownership through `course_id` — and
`tasks.unit_id`, `standalone_notes.unit_id`, `class_meetings.unit_id` and
`study_sessions.unit_id` are all the linking this slice does. The one unique
index that would have been worth adding, `(course_id, position)`, cannot be
(see the renumbering decision above). Nothing was installed: reordering is two
arrows and an array swap.

## 2026-08-27 — The encryption helper is `lib/crypto.ts`, pulled forward out of slice 10
Because: prompts/09-drive.md says to store the Google refresh token "encrypted
with `modules/agents/crypto.ts`" — and that module belongs to slice 10, which has
not been built. Slice 09 needed it first, and reaching across a boundary into a
module that does not exist yet is not a thing. It also owns no table, so by
CLAUDE.md's layout it was never a module: `/lib` is for "db clients, env
validation, shared utils", and AES-256-GCM over an opaque string is the third of
those. It reads `process.env.ENCRYPTION_KEY` directly rather than through
`lib/env.server.ts`, because that file imports `server-only`, whose default
export throws outside a React Server Component — anything importing it cannot be
unit-tested (the same reason `scripts/seed-check.ts` builds its own Supabase
client). `lib/env.server.ts` still validates the variable, so a missing key fails
at boot, not at the moment a token is written. **Slice 10 imports this for
`agent_profiles.api_key_enc`; it does not write a second one.** The format is
`v1.<iv>.<tag>.<ciphertext>`, versioned so a future algorithm change is
detectable rather than a silent garbling. `lib/crypto.test.ts` proves the
round-trip and proves that a flipped byte anywhere — ciphertext, tag, iv — or the
wrong key refuses to decrypt at all.
Instead of: building slice 10's module early (rule 9 forbids it, and the agents
module is a role registry and a BYOK settings screen, none of which this slice
needs), or storing the refresh token in the clear until slice 10 arrives.

## 2026-08-27 — `drive.file` is the only scope, and there is a test that says so
Because: docs/SCHEMA.md and prompts/09-drive.md both make this a hard constraint
rather than a preference — `drive.file` is non-sensitive, needs only basic OAuth
verification, and grants access *only* to files handed over through the Picker or
created by this app. `drive.readonly` and `drive` are restricted, grant the entire
Drive, and trigger a security assessment. Written down, that rule lasts until the
first slice where a wider scope would be convenient, so
`modules/google/drive-scope.test.ts` reads the authorize URL this app builds and
fails if any of the four wider Drive scopes ever appears in it. The connected
account's email address is read from `drive/v3/about`, which `drive.file` can
already answer — so not even an `email` or `profile` scope is requested.
Instead of: adding `userinfo.email` to learn the address (a second scope on the
consent screen for one string), or trusting a comment to hold the line.

## 2026-08-27 — Plain `fetch` against Google's REST APIs, no `googleapis` SDK
Because: this slice makes six kinds of HTTP call — token exchange, token refresh,
revoke, `about.get`, `files.get`/`files.list`/`files.create`, and a download. The
`googleapis` package is tens of megabytes of generated clients for all of Google,
and CLAUDE.md asks for boring, minimal code. Every endpoint used is documented and
stable. Nothing was installed for the Picker either: it is a `<script>` from
apis.google.com and about forty lines of loader in
`components/files/drive-client.ts`, with a hand-written type for the five methods
actually called.
Instead of: `googleapis` (a very large dependency for a handful of REST calls) or
a typed picker wrapper from npm (a package to avoid writing one interface).

## 2026-08-27 — The browser uploads to Drive directly; the app never sees the bytes
Because: a slide deck is routinely 10–40MB, and a Server Action's request body is
capped (1MB by default, and 4.5MB on Vercel regardless). Routing a deck through
this app would mean a size limit that has nothing to do with Drive, plus a
megabyte-scale buffer in a serverless function. The browser already needs a
`drive.file` access token for the Picker, so it uses the same token to `POST` to
Google's upload endpoint — multipart in one request under 5MB, resumable above it
— and then sends the app nothing but the resulting **file id**. Every other fact
about the file (name, mime type, size, links) is read back from Drive server-side,
so a forged form cannot put a made-up filename on a lecture page. It is also
docs/SCHEMA.md's "store the reference, never the bytes" taken literally: the bytes
never touch this app at all, in either direction, except when streaming one back
for the in-place viewer.
Instead of: a `/api/upload` route (a body limit and a buffer for no benefit), or
raising `bodySizeLimit` far enough for a 40MB deck (which is a limit on *every*
action, not just this one).

## 2026-08-27 — A short-lived Drive access token is deliberately handed to the browser
Because: the Google Picker exists only as browser JavaScript, and the Picker is
the thing that *grants* `drive.file` access to a file — without it the scope can
only ever see files this app created. `PickerBuilder.setOAuthToken` is not
optional. CLAUDE.md's Never rule 4 says no API key, service-role key or OAuth
token in a file containing `'use client'` or under `/components`, and that holds
exactly: `components/files/drive-client.ts` contains no credential, and none is in
the bundle. The token is minted by a Server Action at the moment of the click,
lives about an hour, is scoped to `drive.file` alone, and is used and dropped —
never written to a file, a cookie or `localStorage`. The refresh token and the
client secret never leave the server, and the refresh token is encrypted even
there.
Instead of: a server-rendered file browser (which would need `drive.readonly` to
list anything — the restricted scope this whole design exists to avoid).

## 2026-08-27 — Every write in `modules/files` runs one shared `checkLinks`
Because: `files` is the sixth table in a row whose writes take an id from the
browser — `courseId`, `meetingId` and `blockId` all come from the page the attach
button was pressed on — and the RLS policy validates `workspace_id` and nothing
else. The five before it each shipped this bug once (`createOneOffMeeting` in 04,
`createStandaloneNote` in 05, `modules/tasks` in 06, `modules/study` in 07,
`modules/courses`'s syllabus writes in 08 — all above). So the check is inside the
service, not at the call sites: no call site can forget it because no call site
performs it. It runs *before* the module asks Google anything, which
`file-attachments.test.ts` asserts explicitly — otherwise a foreign lecture id
would fail with "no Google account" and the error itself would leak which Drive
file ids exist. `Recalc/<course code>/` is built from a code read out of the
lecture's own row (`courseCodeForMeeting`), never from a form, so an upload cannot
be aimed at another course's folder.
Instead of: a check per server action (four actions, four chances to forget), or
leaning on RLS, which cannot see the relationship between two tables and is not in
the picture at all for a service-role caller.

## 2026-08-27 — Small pasted images go to Supabase Storage, and `storeFor` is the one place that decides
Because: prompts/09-drive.md point 6 — "Drive is for files I would want to find in
Drive". A screenshot pasted mid-lecture is not one of those. The routing rule is a
pure function in `lib/files.ts` (`image/*` and ≤5MB → Supabase; everything else →
Drive) with its own test, in the same tradition as `lib/today.ts`,
`lib/calendar.ts`, `lib/tasks.ts`, `lib/study.ts` and `lib/syllabus.ts`. It is what
makes pasting a photo of the whiteboard work with **no Drive account connected at
all**, which the slice's "everything must still work" constraint requires. The
bucket is private and objects are named `<workspace_id>/<uuid>.<ext>`, so the
first path segment *is* the ownership check the Storage policy in migration 005
runs, and the page gets a one-hour signed URL rather than the bucket being public.
Those images do travel through a Server Action, so `next.config.ts` raises
`bodySizeLimit` to 6MB — above the 5MB ceiling, and still small.
Instead of: a public bucket (a private note's whiteboard photo on a guessable
URL), or sending everything to Drive (a Drive full of `Screenshot 2026-08-27.png`,
which is the thing point 6 exists to prevent).

## 2026-08-27 — A pasted image lands in the lecture's Files, not inside the note document
Because: TipTap's StarterKit has no image node, so rendering one inline would mean
a new extension, a schema change to how `plainTextOf` walks the document, and a
way for a private signed URL to be re-signed every time the note is read — three
things that all touch the staleness invariant, in a slice that is about files. So
`NoteEditor` gained one optional `saveImage` prop, keeps knowing nothing about
files or the database (it posts a `FormData` with one field), intercepts an image
paste or drop, and says one line: "Saved to this lecture's files." The picture is
one tile down the page. Booked below for a later pass.
Instead of: an inline image node with a URL that expires an hour after the note
was written, or refusing pasted images entirely.

## 2026-08-27 — Remove-from-app and delete-from-Drive are separated by a sheet, not a tooltip
Because: prompts/09-drive.md point 5 makes "the app never deletes a Drive file" a
rule, and the only place it could be broken is `removeFile`. That function deletes
the `files` row and stops; there is no Drive delete call anywhere in the codebase.
The UI has to make that unmissable rather than merely true, so **Remove** opens a
sheet that says the file stays in your Google Drive and that deleting it is
something you do in Drive. The one case that is different is an image Recalc
itself put in Supabase Storage: nothing else points at it and there is no bucket
the user browses, so the object goes too — and the sheet says *that* instead.
Instead of: a one-tap remove with the explanation in a `title` attribute (invisible
on a phone, which is where this is used).

## 2026-08-27 — Every Drive failure degrades to a sentence, and a missing thumbnail is not a failure
Because: prompts/09-drive.md point 7 asks for exactly this. A revoked token is
recognised by `invalid_grant` (or a 401 from Drive), flips
`google_accounts.status` to `needs_reconnect` in the same breath, and every screen
then says "Google Drive needs reconnecting" with a link to `/settings/drive` — one
sentence in one place rather than five different failures. A file deleted in Drive
comes back as a 404, and `/api/drive/[fileId]` answers with **plain text**, never
an error page, so a broken tile cannot take the lecture page down with it; the
viewer offers Remove. A missing thumbnail is not an error at all — the tile draws
the file's extension instead, and the `<img>`'s `onError` falls back to the same
thing when a thumbnail 404s after the page rendered. Offline is checked with
`navigator.onLine` before any upload starts, because failing at the *end* of a
40MB upload on a train is the worst version of this. Crucially, a lecture page
never calls Google while rendering: it reads `files` and `google_accounts`, both
plain table reads, so the page is instant and correct with Drive down, revoked, or
never connected.
Instead of: verifying every attached file against Drive on each render (a network
call per file per page load, to learn something that is almost always unchanged).

## 2026-08-27 — `google_accounts` is keyed by `user_id`; `files` is keyed by `workspace_id`
Because: a Google account is a fact about the person, and docs/SCHEMA.md's column
list says `user_id`. Its RLS policies are therefore `user_id = (select auth.uid())`
rather than the workspace subquery every other table uses — the first table in the
project to differ, and correct: `auth.users` is the only thing that outlives a
workspace, and slice 14 attaches Gmail to the same row. `files` is workspace-scoped
like everything else. `files.course_id`, `meeting_id` and `block_id` are all
`on delete set null` rather than cascade, because losing a course must not destroy
the record of a file that is still sitting in Drive.
Instead of: a `workspace_id` on `google_accounts` for consistency's sake, which
would mean reconnecting Google if a workspace were ever recreated.

## 2026-08-27 — One migration, and no dependencies, in slice 09
Because (rule 10): nothing was installed. Google is plain `fetch`, the Picker is a
script tag, and the crypto is `node:crypto`. `supabase/migrations/005_drive.sql`
creates `google_accounts` and `files` exactly as docs/SCHEMA.md specifies them,
with RLS enabled and four policies each in the same file, plus the private
`note-images` bucket and its four Storage policies. Two additions the schema doc
does not spell out: a `check` constraining `provider` to `drive | supabase`, and a
unique index on `(workspace_id, provider, provider_id, meeting_id, course_id,
block_id) nulls not distinct` — the same deck attached to two lectures is
legitimately two rows, but a double-tap on Attach must not make it two on one
lecture. `nulls not distinct` needs Postgres 15+; this project is on 17.

## 2026-08-27 — Slice 10 reuses `lib/crypto.ts` instead of building `modules/agents/crypto.ts`
Because: prompts/10-agents.md step 2 asks for `modules/agents/crypto.ts` doing
AES-256-GCM over `ENCRYPTION_KEY`, storing iv + authTag + ciphertext, with a
known-plaintext round-trip test. That file already exists, at `lib/crypto.ts`,
pulled forward during slice 09 — and the decision that pulled it forward says in
so many words: "**Slice 10 imports this for `agent_profiles.api_key_enc`; it
does not write a second one.**" A second AES-GCM implementation is exactly the
duplication that decision was written to prevent: two ciphertext formats, two
key parsers, and a day when one of them is fixed and the other is not. It is a
plain shared util in `/lib` with no table of its own, so importing it from
`modules/agents/registry.ts` is not a module-boundary crossing (Never rule 1
governs `@/modules/*/*`, not `@/lib/*`).
Instead of: a byte-identical copy under `modules/agents/`, or moving
`lib/crypto.ts` into the module — which would break `modules/google`, whose
refresh token encryption has been using it since slice 09.

## 2026-08-27 — `agent_profiles` is keyed by `user_id`, like `google_accounts` and unlike everything else
Because: docs/SCHEMA.md names the column and the rule — "unique per user+role" —
and it is right for the same reason slice 09's `google_accounts` was: an API key
is a fact about the person, `auth.users` is the only thing that outlives a
workspace, and re-creating a workspace must not mean fetching three keys out of
a password manager again. Its RLS policies are therefore
`user_id = (select auth.uid())` rather than the workspace subquery the other ten
tables use. The knock-on is that `/settings/agents`' actions and /today's
onboarding check re-derive a **user id** from the session where every other
screen re-derives a workspace id.
Instead of: a `workspace_id` for consistency's sake, which would contradict
docs/SCHEMA.md and make the keys disposable along with the workspace.

## 2026-08-27 — Migration 006 adds `key_hint` and `updated_at`, which SCHEMA.md does not list
Because: the settings screen has to show *which* key is saved
(prompts/10-agents.md: "Keys are shown masked after saving"), and the only two
ways to do that are to decrypt on every page render or to keep a few characters
in the clear. `key_hint` is the last four characters, which cannot call
anything, and it means **rendering a page never touches the plaintext at all** —
the key is decrypted at exactly one moment, when a provider is about to be
called. `updated_at` exists because re-pasting a key updates the row, so
`created_at` would go stale and the screen could not say when the key last
changed. Both are the same class of addition as migration 002's four guards and
005's provider check.
Instead of: decrypting three rows to draw a settings page (a page render that
handles secrets is a page render that can leak them), or a `masked_key` column
holding the whole display string (the same data, pre-formatted, so the format
can never change).

## 2026-08-27 — `modules/agents/registry.ts` is the only file in the codebase that imports a provider SDK, and a test says so
Because: CLAUDE.md's Never rule 6 and prompts/10-agents.md's constraint are both
rules that hold until the first slice where breaking them is convenient — unless
something fails. `modules/agents/no-provider-sdk.test.ts` reads every source
file under `app`, `components`, `lib`, `modules` and `scripts` and fails if
`@ai-sdk/*`, `@anthropic-ai/sdk`, `openai` or `ai` is imported anywhere but this
module; it also fails if a `'use client'` file or anything under `/components`
imports `@/modules/agents` or `@/lib/crypto`, or if `api_key_enc` is named
outside the module that owns the table. It is the same enforcement shape
`lib/design-tokens.test.ts` uses for rule 7, and it has a third test that fails
if the registry itself *stops* importing the providers — otherwise the suite
would pass on a codebase that reaches no model at all.
Instead of: a comment saying so, or trusting the lint rule, which knows about
module boundaries but nothing about which package a file may reach.

## 2026-08-27 — `registry.ts` does not `import 'server-only'`, even though it decrypts keys
Because: `server-only`'s default export throws outside a React Server Component,
so anything importing it cannot be unit-tested — the same reason `lib/crypto.ts`
leaves it out and `scripts/seed-check.ts` builds its own Supabase client
(docs/DECISIONS.md, above). The routing this file does — role in, configured
model out — is precisely the part that can be silently wrong, and
`registry.test.ts` proves it with no database, no network and no real API key.
The guarantee `server-only` would have given is kept by the tree-reading test
above instead, which is strictly stronger: it fails on a `'use client'` file that
*imports* this module, rather than on a runtime that happens to reach it. The
production bundle was checked directly too — `.next/static` contains no
occurrence of `api_key_enc`, `decryptSecret`, `ENCRYPTION_KEY`, `createAnthropic`
or `x-api-key`.
Instead of: `import 'server-only'` and an untested registry, which trades the
part that is provable for the part that already is.

## 2026-08-27 — The model list is a menu, not a whitelist
Because: prompts/10-agents.md's definition of done ends "switch the provider to
Gemini and have it still work without any code change", and a provider ships a
model far more often than this app ships a slice. So `MODEL_CHOICES` in
`modules/agents/schema.ts` is three suggestions per provider that fill the
`<select>`, and every role form also has an "or type a model id" box that
overrides it. `chatModelFor` passes whatever string it is given straight to the
provider SDK. That keeps Never rule 6 honest in the strong sense: the only place
a model name is *chosen* is a row the user typed, and the list exists so the
picker is not empty.
Instead of: a zod enum of known model ids (a build to change a model), or a free
text field with no suggestions (a screen that asks you to remember
`text-embedding-3-small` exactly).

## 2026-08-27 — Anthropic cannot fill the `embed` role, and the screen never offers it
Because: Anthropic publishes no embedding model —`@ai-sdk/anthropic` types its
`textEmbeddingModel` as returning `never`. `providersForRole('embed')` therefore
returns Google and OpenAI only, `saveAgentProfile` refuses the combination
server-side, and `embedModelFor` refuses it a third time with a sentence rather
than letting a request go out and fail at the provider. Three layers because the
first is a `<select>` in a browser and the second is a public POST endpoint.
Instead of: letting it be picked and failing at call time in slice 13, which is
three slices away from the screen where the mistake was made.

## 2026-08-27 — A blank key field means "keep the key already saved", but only when the provider is unchanged
Because: changing `fast` from `claude-opus-5` to `claude-haiku-4-5` should not
mean opening a password manager. The key field is optional when a row already
exists for that role *with that provider*; switching provider requires a new key,
because a Claude key cannot call Gemini and silently reusing it would produce a
401 that looks like a bug. The service enforces both halves, so the rule holds
for any caller, not just the form.
Instead of: always requiring the key (a paste every time a model id changes), or
always keeping it (a provider switch that fails at the provider with a message
about authentication rather than about the thing that was actually wrong).

## 2026-08-27 — Every failure in `testAgentConnection` is a returned sentence, never a throw
Because: prompts/10-agents.md asks for a button that "reports plainly whether it
worked", and its constraint says a missing or invalid key must degrade rather
than crash. So a missing row, an unreadable ciphertext, a wrong key, a model id
the provider has never heard of and a dead network all come back as
`{ ok: false, detail }` with one line. `safeMessage` scrubs the key out of that
line **by value** — OpenAI's 401 body echoes the key back — and then anything
else key-shaped **by shape**, before truncating to one short sentence. The
missing-row and unreadable-key cases return before a model is even built, which
`agent-profiles.test.ts` asserts, so a Test connection press on an empty role
makes no network call at all. `AgentNotConfigured` and `AgentKeyUnreadable` are
named error classes rather than strings, so slice 11 can catch the right one.
Instead of: letting the provider's error reach a screen (which is how a pasted
key ends up in a screenshot), or a generic "something went wrong" (which is
useless at 11pm when the answer is "you typo'd the model id").

## 2026-08-27 — `/settings/agents` is reached from the other two settings screens
Because: the mobile bottom nav was measured at five columns in slice 03 and
recorded as full — "a *sixth* would not fit" — and slices 07 and 08 both
followed that measurement rather than re-litigating it. So `/settings/agents`
takes the same door `/settings/semester` and `/settings/drive` already use: a
small link in the other settings screens' headers, plus the one quiet line on
/today while no `fast` model exists. Both of the other settings screens are
themselves reachable from the calendar header and a lecture page.
Instead of: a sixth 65px column on a 390px phone, or a settings section with its
own nav, which is a bigger piece of work than this slice and would belong to
whichever slice finally rethinks the nav (booked below).

## 2026-08-27 — The /today prompt is neutral, not accent
Because: docs/DESIGN.md says the accent appears in exactly two places — something
needs attention, and the now-line — and slices 04 and 08 both declined to add a
third. A model that has not been set up yet is not an alarm; it is a thing you
have not done. So the strip is one `--text-muted` line and an underlined link in
a plain Card, under the study strip, and it disappears the moment a `fast` key
is saved. prompts/10-agents.md's own words are "a single quiet prompt... not a
modal, not a wizard".
Instead of: an accent banner (a fourth place the accent appears, shouting on the
first morning the app is opened), or a dismissible card (state to store, for a
message that dismisses itself when it is acted on).

## 2026-08-27 — Migration history versions rewritten to `005` and `006`
Because: slice 01 established that `supabase_migrations.schema_migrations` should
match the filenames exactly, so `npm run db:push` works. Slice 09 applied its
migration through the MCP, which stamped a timestamp version (`20260826211633`)
instead of `005` — leaving a gap that would have made `db push` try to re-apply
`005_drive.sql` on top of tables that already exist, and 006 would have inherited
the same problem. Both rows were rewritten to `005`/`drive` and `006`/`agents`
after applying. The SQL itself was untouched; only the version label changed.
Instead of: leaving both as timestamps (two conventions in one history table), or
fixing only 006 (which would have left `db push` broken at 005 anyway, in a
project where the documented way to apply a migration is `npm run db:push`).

## 2026-08-27 — Dependencies added in slice 10
Because (rule 10, one line each):
`ai` — the Vercel AI SDK named in CLAUDE.md's stack table; `generateText` and
`embed` are what the Test connection button actually calls.
`@ai-sdk/anthropic` — the Claude provider, which is the key Aadit is pasting first.
`@ai-sdk/google` — the Gemini provider, named in the slice's definition of done
("switch the provider to Gemini").
`@ai-sdk/openai` — the third provider, and the only one besides Google with an
embedding model, so the `embed` role has two options rather than one.
Instead of: the Vercel AI Gateway (this is BYOK with the user's own direct
provider keys — a gateway would put a second account and a second bill between
Aadit and his own key), or each provider's first-party SDK (three different
request shapes, and the stack table says AI SDK).

## 2026-08-27 — The engine asks modules/agents for a *function*, not a model
Because: prompts/11-recalc-engine.md says to call the model via
`agents.registry.getModel('deep')`, and `getModel` hands back a raw AI SDK model
that only `generateText` from the `ai` package can use — which
`modules/agents/no-provider-sdk.test.ts` forbids importing anywhere outside
`modules/agents`. That test is slice 10's whole enforcement of Never rule 6 and
weakening it to satisfy a sentence in a prompt would be the wrong trade. So the
door is `generateWithRole(db, userId, 'deep')`, which returns
`Generate = ({ system, prompt }) => Promise<{ text, model }>`: it calls
`modelSpecFor` and `generateText` *inside* the agents module, and hands the
engine back the text plus the label for `derivations.model` — the provider and
model out of the user's own row, never a name chosen in app code. The engine
still never learns which model answered until after it has answered.
**And it is the test seam.** `runDerivation` takes an optional `generate`, so
`modules/recalc/recalc-engine.test.ts` can drive the *real* worker — real status
transitions, real receipt bookkeeping, real `updateBlock`, real cascade, real
database — with only the provider's network faked, using the AI SDK's own
`MockLanguageModelV4` through the real `generateText`. There is no key on this
machine, so without a seam the only outcome any test could reach is failure.
The default path is exercised too, honestly: the "no model configured" test
passes no `generate` at all, so the registry really is asked for the `deep`
role and really does throw `AgentNotConfigured`.
Instead of: importing `ai` into `modules/recalc` (deletes the slice-10
invariant), or `vi.mock`ing the module (which would test a mock's shape rather
than the worker's behaviour), or leaving the model call unmockable and shipping
an engine whose success path had never once been executed.

## 2026-08-27 — "Keep old" moves the receipt forward and goes back to `fresh`
Because: this is a genuine product judgement and there was nobody to ask, so
here is the reasoning. The alternative — leave it `stale` until an accept — was
rejected on two grounds. First, the badge. prompts/11-recalc-engine.md calls the
stale count "the number that makes me open the app"; a number that cannot be
cleared except by accepting a rewrite you have already decided is worse stops
being a signal within a week, and /review becomes the graveyard the 30-day
overdue cap in slice 03 was written to avoid. Second, and more important:
`derivation_sources` is a *receipt*, and a receipt records what this summary was
checked against. Pressing Keep old is a check — a person read the diff and
concluded the summary is still true of the note as it now stands. Recording
that is honest; leaving the receipt pointing at a version nobody is claiming
anything about is not.
So the derived block is untouched (its `version` does not move, so nothing
downstream of the summary is disturbed), the receipt is rewritten to the
versions and text the sources are at *now*, and the status goes `fresh`. The
next real edit stales it again through the same trigger — there is a test named
for exactly that, because "Keep old" must not be a way to freeze a summary
forever. The screen says so in one line under the buttons.
Instead of: staying `stale` (a queue that only grows and a badge that stops
meaning anything), or a fourth status like `dismissed` (a new state in the one
state machine the whole product rests on, to express something `fresh` plus an
updated receipt already says exactly).

## 2026-08-27 — Migration 007 adds `derivation_sources.source_text`
Because: /review's job is "which sources changed, **and a diff of what changed
in them**". The receipt already records which block and which version, which is
everything the cascade needs — but a version number cannot be diffed. Without a
snapshot of what the block said when it was read, the best the screen could
manage is "this went from v2 to v3", which is the difference between a receipt
and an answer. The column is nullable: the rows `staleness.test.ts` and
`tiptap-staleness.test.ts` write by hand have no snapshot and neither does
anything predating this slice, and a source with no snapshot renders as changed
with no before/after rather than an invented one.
Instead of: keeping the snapshot inside the derived block's `content` jsonb
(where `plainTextOf` would ignore it, so it *would* work — and it would be a
second place the source versions live, free to disagree with the receipt), or
diffing only old summary against new summary, which shows the consequence and
never the cause.

## 2026-08-27 — A summary block is not a child of its note; the receipt is the link
Because: `saveNoteDocument` reconciles a note document against the nodes the
editor sent and soft-deletes every child it does not recognise — so a summary
parked under the note would be destroyed by the next keystroke. It could have
been given a `note_id` column instead, but there is a better answer already in
the schema: the derivation's own sources say what it was built from, and adding
a column would create a second fact that can disagree with them. So the summary
block hangs off nothing, and **the note document block is itself recorded as a
source** — it carries the title, the recipe reads the title, and
`subjectNoteOf` finds the note by looking for the source that is a note. One
fact, in the place the product already keeps it.
Instead of: a `derivations.note_block_id` column (a second source of truth), or
parenting the summary to the note (deleted on the next autosave).

## 2026-08-27 — Every live child of the note is on the receipt, including the empty ones
Because: an under-recorded source is a staleness bug that stays completely
invisible until the day somebody edits that exact block and nothing goes stale.
An empty paragraph contributes nothing to the prompt, but typing a sentence into
it later bumps its version — and if it is not on the receipt, that edit cascades
nowhere. The recipe therefore hands back the very array it built the prompt
from rather than re-deriving a list of "inputs" beside it, so the two cannot
drift: `RecipeOutput.sources` *is* what `derivation_sources` is written from.
Instead of: recording only the paragraphs that had text in them, which is
smaller, tidier, and wrong.

## 2026-08-27 — The worker re-reads the versions after a run, and fails towards `stale`
Because: `mark_derivations_stale()` only touches rows whose status is `fresh`.
While a run is in flight the row says `computing`, so an edit that lands during
the model call is invisible to the trigger — and the run would then finish by
writing `fresh` against a version that is already behind. That is a summary
claiming to be current when it is not, which is the one thing this product may
never do. So after the status goes fresh, the recorded versions are read once
more and compared; if one moved, the row is set `stale`. This is emphatically
not a second implementation of the cascade — it decides nothing about which
derivations an edit affects, it asks only "did the blocks I just recorded move
while I was working?" — and it is the single place in TypeScript that writes
that value, in a repo function named `markStaleAfterRun` so it cannot be reached
for anything else. `repo.setStatus` does not accept `'stale'` at all, by type.
There is a test that edits a paragraph from inside the fake model call.
Instead of: trusting the trigger through the `computing` window (a silent,
permanent false "up to date" — the exact failure docs/PRODUCT.md is about), or
never marking `computing` (which loses the "never stuck computing" guarantee the
slice asks for).

## 2026-08-27 — Accept writes the text that was shown, guarded on the versions
Because: /review's contract is that you read *this* version and accept *this*
version. Regenerating on Accept would write something the person never read, and
a summary is not deterministic. So Regenerate previews (writing nothing at all —
the row stays stale with its old receipt, so closing the tab costs nothing) and
Accept posts that text back. The text is client-supplied and that is fine: it is
the user's own content in their own workspace and they just approved it. The
*versions* are client-supplied too and that is not fine, so they are used for
exactly one thing — proving nothing moved in between. What lands on the receipt
is the server's own fresh read, and if a paragraph changed since the preview the
accept is refused with a sentence rather than recording a version the summary
was not built from. `derivations.model` is likewise re-read from the `deep`
role's own row rather than believed from the browser. There is a test that edits
the note between the preview and the accept and asserts the refusal leaves
everything untouched.
Instead of: regenerating on Accept (accepting a version nobody saw), or trusting
the posted versions (a forged POST could mark a summary fresh against an edit it
never read — the staleness invariant, broken from the outside).

## 2026-08-27 — Nothing is regenerated on a page render, only on a press
Because: docs/PRODUCT.md rule 2 makes this a product decision rather than a
performance one, and the literal reading of "the current derived content and the
regenerated version side by side" would mean a model call per stale item every
time /review is opened — money spent, and the app quietly deciding things on its
own, which is the behaviour the whole product exists to refuse. So the *diff of
the note* is on screen the moment the page loads, computed from the receipt with
no model involved at all, and the right-hand column says in plain words that
nothing has been generated yet and what pressing Regenerate will cost.
Instead of: generating every preview on load (silent regeneration by another
name), or showing no new version at all until after accepting (accepting
something unseen).

## 2026-08-27 — `lib/diff.ts` is a word-level LCS, not a dependency
Because: it is about seventy lines and it is the part of /review that can be
silently wrong, so it belongs where `lib/today.ts`, `lib/calendar.ts`,
`lib/tasks.ts`, `lib/study.ts`, `lib/syllabus.ts` and `lib/files.ts` already
are: a pure function in /lib with its own test. `lib/diff.test.ts` asserts the
property that actually matters — dropping the additions rebuilds the old text
exactly and dropping the removals rebuilds the new one — because a diff that
renders a sentence nobody wrote is worse than no diff. Above 1200 words on
either side it degrades to a whole-block replace rather than building a
million-cell table.
Instead of: `diff` or `jsdiff` from npm (rule 10, for an algorithm this size),
or a line-level diff, which would call a fixed typo a rewritten paragraph.

## 2026-08-27 — The stale badge is read in the `(app)` layout
Because: the badge has to be on every screen and the layout is the only thing
that renders on every screen. It is one indexed `count` on
`derivations (workspace_id, status)` — the index migration 001 created for
exactly this — and every action that changes the queue calls
`revalidatePath('/', 'layout')` so the number cannot lie. Zero draws nothing at
all: a badge that is always present stops being a signal. It is also the third
place `--accent` appears, and deliberately so — docs/DESIGN.md reserves it for
"something needs attention", and this *is* the thing that needs attention.
Instead of: fetching it in each page (five call sites, four chances to forget),
or a client-side poll (a request every few seconds for a number that changes
when the user changes it).

## 2026-08-27 — One migration, no dependencies, in slice 11
Because (rule 10): nothing was installed. `derivations`,
`derivation_sources` and the cascade trigger have existed since migration 001
and were not touched — the trigger's SQL is byte-for-byte what slice 00 applied.
`supabase/migrations/007_recalc.sql` adds one nullable column and a comment.
Its history row was applied through the Supabase MCP, which stamps a timestamp
version, and was rewritten to `007`/`recalc` immediately afterwards for the same
reason slices 09 and 10 did it: `npm run db:push` only works while the history
matches the filenames.

## 2026-08-27 — A question is a block; `questions` indexes its lifecycle, `question_anchors` says what it is about
Because: `blocks.type` has listed `'question'` since migration 001, so storing
one needed nothing new. What a block cannot say is where it is in a lifecycle,
and `standalone_notes` (003) already set the precedent for that: index the
blocks of one type in their own small table rather than hanging nullable,
type-specific columns off `blocks`. `question_anchors` is the same shape as
`derivation_sources` — a join table, composite primary key, no id of its own —
minus the version column, because **an anchor is not a receipt**. It records
what the question is *about*, which does not change when the paragraph is
edited. What an answer actually *read* stays in `derivation_sources`, which is
the only place the cascade can see.
Instead of: `blocks.question_status`, which would be null on every other row in
the table, or putting versions on the anchors, which would create a second
receipt free to disagree with the real one.

## 2026-08-27 — `modules/recalc` reads an answer's sources from the receipt, and never learns that `modules/questions` exists
Because: `readAnswerSources` resolves an answer's inputs out of
`derivation_sources` — the question block, then every block it names — rather
than out of `question_anchors`. Same reasoning as `subjectNoteOf` in slice 11:
the receipt already says what this was built from, so a second lookup could only
ever contradict it. It also keeps the dependency pointing one way — questions
imports recalc, recalc imports nothing of questions — which is what lets
`generateAnswer` be reachable from a future job that has no question table at
all. The receipt is seeded with the question **and every anchor** the moment the
derivation is created, so it is complete before the first run: an edit that
lands between asking and answering still flags it.
Instead of: `readAnswerSources` querying `question_anchors`, which would put a
module boundary violation and a second source of truth in one line.

## 2026-08-27 — The question block is not a child of the note document
Because: `saveNoteDocument` reconciles a document against the nodes the editor
sent and soft-deletes every child it does not recognise. A question parked in
there would be destroyed by the next keystroke. It hangs off nothing, and
`question_anchors` is what says which paragraphs it belongs to — the same answer
slice 11 reached for summary blocks, for the same reason.
Instead of: a TipTap node type for questions, which would make the question part
of the document's own content and therefore part of what a summary reads.

## 2026-08-27 — Only `open` → `answered` is automatic; `resolved` is never inferred
Because: docs/PRODUCT.md's third rule is that an answered-but-unresolved
question is still an open loop. `answerQuestion` moves the row to `answered`
only when the run actually produced an answer, and only from `open`, so a
regeneration cannot drag a resolved question backwards. `resolved` has exactly
one writer — a button — because it means "a person read this and was satisfied",
which is not something the app can observe. `reopenQuestion` is the way back
from a mis-tap, and it lands on `answered` or `open` depending on whether an
answer exists.
Instead of: resolving on a successful answer, which would empty the revision
list of precisely the questions worth revisiting.

## 2026-08-27 — `app/(app)/(narrow)/questions/` holds actions and no page
Because: questions are read on three screens — a lecture, a note and a course —
and all three need the same four server actions. A directory with no `page.tsx`
creates no route, so the actions live once instead of three times. They
`revalidatePath` the route *patterns* rather than concrete paths, so answering a
question on a lecture page refreshes the course page that counts it.
Instead of: a `/questions` index screen nobody asked for (the nav is full at
five columns), or three copies of the same four functions.

## 2026-08-27 — The exam clause comes from my own task list, because there is no `exam_date`
Because: prompts/12-questions.md asks the sentence to include days remaining
"if an exam date is known". Nothing in this schema stores one. The only place a
real exam date exists is a task I typed myself, so `nearestExamTask` looks for an
open, still-future task on this course whose title contains an exam-shaped word,
and the sentence names it back in my own words — "Your task “Final exam” is due
in 9 days" — so it can never read as a date the app knows and I do not. Null is
the common case and the sentence simply omits the clause.
Instead of: adding an `exam_date` column (a migration and a screen for one
clause), or inferring an exam from the calendar, which is exactly the confident
wrongness this product exists to refuse.

## 2026-08-27 — `/review` labels an answer by its question, and calls it an answer
Because: `getReviewQueue` already had to treat an answer's question block
specially — it is on the receipt but it is not a source that can change, since
nothing in the app edits a question — so it is lifted out as the item's
`question` and the remaining sources are the ones that really moved.
`ReviewItem` takes that as a prop and swaps one noun: "The answer you have" /
"The answer now", with the question quoted above the diff. Without it a stale
answer is a paragraph of prose with no subject, which is the one thing that
screen may not be.
Instead of: a separate review screen for answers (two implementations of the
diff, the accept guard and the three buttons), or leaving the recipe label
"Answer" to carry the whole meaning.

## 2026-08-27 — The course page renders `QuestionView`, not `QuestionRow`
Because: `getUnresolvedQuestions` returns the *view* — the question with its
note, its course, its unit and its answer resolved — and that is what the Open
Questions section draws (`question.note.href`, `question.answer.status`).
`QuestionRow` is the raw `questions` table row and has none of those. Both are
exported from `modules/questions`; the page imports the view from the module's
`index.ts`, never from `schema.ts` (rule 1).
Instead of: casting the row type to silence the error, which would have compiled
and then rendered `undefined` in four places.

## 2026-08-27 — One migration, no dependencies, in slice 12
Because (rule 10): nothing was installed. `supabase/migrations/008_questions.sql`
adds `questions` and `question_anchors`, both with RLS enabled and all four
policies (rule 8) — `question_anchors` inherits ownership through the question
block, exactly as `derivation_sources` inherits it through its derivation. The
cascade trigger from migration 001 is untouched: an answer goes stale through
the same `mark_derivations_stale()` a summary does, and there is a test that
proves it (`modules/recalc/answer-staleness.test.ts`).

## 2026-08-27 — The version predicate is stated once, in a view, and every read path goes through it
Because: docs/SCHEMA.md says "query only rows where `block_embeddings.version =
blocks.version`", and a predicate that has to be remembered in three queries is
a predicate that will be forgotten in a fourth — at which point search returns a
sentence the user deleted five minutes ago, which is the exact bug this product
exists to prevent. So migration 009 defines `current_block_embeddings` as that
join, `with (security_invoker = on)` so it is not a hole around RLS, and
`search_blocks` reads the view rather than the table. `modules/search/repo.ts`
has no `select` that could reach a vector any other way: `listEmbeddingRows`
deliberately selects only `block_id, version, model, created_at`.
Instead of: repeating `and e.version = b.version` in each query, or enforcing it
in TypeScript — a second copy of the one rule the slice exists to keep.

## 2026-08-27 — A stale embedding row is left in the table, not deleted on write
Because: "we delete the old row when we write the new one" is a promise that
holds for exactly as long as every write path keeps making it. "The old row
cannot be read" is a property of the schema and holds even if the cleanup job
never runs, even if a row is written by a script, even if a version is bumped
from the Supabase table editor. The keying — `primary key (block_id, version)` —
is what makes re-embedding an INSERT of a new row rather than an UPDATE of the
old one, so the old vector survives by construction and is dead by construction.
`modules/search/search-staleness.test.ts` asserts both halves in the same test:
the version-1 row is still physically in `block_embeddings`, and the block does
not come back for a query that is a near-exact match for it.
Instead of: deleting on write, which would make the test pass for a weaker
reason and would tie correctness to a job running.

## 2026-08-27 — The re-embedding queue is derived, not a table and not a trigger
Because: a block needs a new vector exactly when it has no row at its *current*
version — which is the same version comparison the whole slice turns on, asked
the other way round. Bumping a version therefore enqueues the block by
definition: nothing is written, nothing can be missed, and the queue cannot
drift out of step with the truth. `pending_embeddings(workspace, limit)` is that
anti-join, and "only changed blocks get re-embedded" is not a rule the indexer
applies but a fact about what comes back — an untouched paragraph already has a
row at its current version and never appears.
Instead of: an `embedding_queue` table with an enqueueing trigger, mirroring
slice 11's `mark_derivations_stale()`. That trigger has something to write that
cannot be recomputed (a *status*, which records that a human has not yet looked
at a derivation); this one would not, and would only add a second source of
truth plus an at-least-once/at-most-once problem. Slice 11 also cannot delete
what it flags; this one must not, so a trigger that removed the stale row would
break the control case above.

## 2026-08-27 — The full-text half reads live blocks; only the vector half needs guarding
Because: prompts/13-search.md asks for both halves to be constrained to the
version match, and the lexical half satisfies it in the only way it can — it
reads `blocks` itself, so the words it matches ARE the current version's words.
Editing a sentence makes the old wording unmatchable in the same statement that
saves the new one, which is what makes "a passage I edited five minutes ago is
already findable in its new form" true without waiting for a model. There is no
versioned side table on that side to be stale. The vector half is the one with a
derived artefact, and it reads the view.
Instead of: constraining the lexical half to blocks that happen to have a
current embedding, which would have made search return nothing at all on a
machine with no provider key — this one — and would have made a freshly edited
paragraph unfindable by its new words until a model had been paid to read it.

## 2026-08-27 — Hybrid merging is reciprocal rank fusion, in SQL
Because: `ts_rank` and cosine distance are not on the same scale and never will
be, so any weighted blend of the two numbers is a magic constant that has to be
re-tuned every time the corpus or the embedding model changes. Ranks are
comparable. Each half contributes `1 / (60 + its rank)` and the two are added,
which is the standard formulation; 60 is the standard damping. It is done in one
SQL statement so the two halves are limited, merged and ordered before anything
crosses the wire.
Instead of: two round trips merged in TypeScript, which would have meant
fetching both candidate sets in full and would have put the ranking — the part
that decides what the user sees — outside the file that owns the predicate.

## 2026-08-27 — `search_blocks`, `pending_embeddings` and `delete_stale_embeddings` are SQL functions, and this is the first `rpc` in the project
Because: all three are joins or anti-joins between `block_embeddings` and
`blocks`, and PostgREST's query builder cannot express any of them — there is no
way to say "where this table's version equals that table's version" through
`.eq()`. They are `security invoker` with `search_path = ''` and every object
schema-qualified, the same hardening migration 001 gives
`mark_derivations_stale()`, so RLS still applies as the signed-in user and the
functions cannot be hijacked by an object in another schema.
Instead of: reading every block and every embedding into Node and joining them
there, which would move the predicate into the language where it is easiest to
forget and would read the whole workspace to answer one query.

## 2026-08-27 — `modules/agents` gains `embedWithRole`, the embedding twin of `generateWithRole`
Because: CLAUDE.md's Never rule 6 and `no-provider-sdk.test.ts` between them mean
the `ai` package may not be imported outside `modules/agents`, so what the search
module holds is a *function* — strings in, vectors out — rather than an embedding
model. That is the same seam slice 11 built for the chat roles and it buys the
same thing: `indexWorkspace` and `searchWorkspace` both take an `embed` option,
and the slice's test substitutes one built on the AI SDK's own
`MockEmbeddingModelV4`, so all of the indexing and all of the searching runs for
real against the real database with only the provider's network faked.
Instead of: `getModel(db, userId, 'embed')` returning a model that the search
module then calls `embed()` on — which would have needed `import { embed } from
'ai'` inside `modules/search` and failed the test that guards rule 6.

## 2026-08-27 — Migration 009 adds `model` and `created_at`, which SCHEMA.md does not list
Because: vectors produced by two different embedding models are not comparable
at all, so a row has to say which one produced it — without that column, changing
the embed role in Settings silently corrupts every distance in the table with no
way to tell which rows are which. `created_at` is the search screen's "indexed 3
minutes ago". Both are the same kind of addition migration 006 made with
`key_hint` and migration 007 made with `source_text`: SCHEMA.md gives the shape,
a slice adds what that shape turns out to need.
Instead of: inferring the model from `agent_profiles`, which records what the
role holds *now*, not what wrote a row six weeks ago.

## 2026-08-27 — Search is a GET with `?q=`, and the only client component is the index button
Because: a search that is a URL is linkable, back-navigable, refreshable and
prefetchable, and a plain `<form action="/search">` needs no JavaScript at all —
which is what "Server Components by default" is for. The one thing that genuinely
cannot be a form post is "Update the index": it calls a model provider and takes
seconds, and a page sitting there saying nothing reads as broken, so
`components/search/index-button.tsx` is a leaf `'use client'` with a
`useTransition`, exactly like `components/questions/question-card.tsx`.
Instead of: a client-side search box with debounced fetches, which would have
meant a loading state on primary content (docs/DESIGN.md, principle 3) and a
search you cannot send to yourself.

## 2026-08-27 — Search is the sixth nav destination, and six is the limit
Because: search has to be reachable from every screen or it is not search, and
the bottom bar is the only chrome this app has. Six columns at 390px is 65px
each, which still fits a 20px icon over a 12px label — docs/DESIGN.md's floor —
and is comfortably past the 44px tap target. `AppNav`'s comment now says six is
the limit; a seventh destination needs a different pattern, not a narrower
column.
Instead of: a search icon in a top bar, which docs/DESIGN.md specifies at 56px
but which this app has never built and which would be a whole piece of chrome
introduced sideways by a slice about embeddings.

## 2026-08-27 — A hit that does not resolve to a note is dropped from the results
Because: every result on the screen is a link, and a result you cannot open is
not a result. `getNoteRefs` resolves a paragraph to the document it lives in and
the page that opens it; blocks that hang off nothing — a `summary`, an `answer`,
a `question` — have no note to open, so they are filtered out in
`modules/search/service.ts` after the query rather than shown as dead rows.
Instead of: showing them under a "not in a note" heading, which would put
AI-written text into a screen whose whole promise is "anything **I** have
written", and would list every summary twice over beside the paragraphs it was
made from.

## 2026-08-27 — One migration, no dependencies, in slice 13
Because (rule 10): nothing was installed — pgvector was already enabled by
migration 001 (`create extension if not exists vector with schema extensions`)
and is deliberately not enabled again, which is why every vector type and
operator in 009 is spelled `extensions.`. `supabase/migrations/009_search.sql`
adds `block_embeddings` with RLS enabled and all four policies (rule 8),
ownership flowing through the block exactly as `question_anchors`' flows through
its question block; a GIN index on `blocks` for the lexical half and an HNSW
index on the vectors for the semantic one; the `current_block_embeddings` view;
and four functions. HNSW rather than ivfflat because ivfflat's lists mean
nothing until the table has rows in it, and this table starts empty.

---

## Noticed, not fixed

Things spotted outside the current slice. Do not fix them mid-slice; write them here.

- ~~Migration 001 was applied by pasting it into the Supabase SQL editor, so the
  CLI's migration history table does not record it.~~ **Fixed in slice 01** — see
  the decision above. History now holds `001`/`foundation` and `002`/`semester`,
  matching the two files. `npm run db:push` and `npm run db:types` both work.
- Supabase's security advisor reports one project-level warning:
  **leaked password protection is disabled** (Auth → Providers → Password). It is
  a dashboard setting, not schema, and unrelated to this slice's tables. Worth
  ticking on before the app is public.
- `vitest.config.ts` triggers a Vite warning: "ESM syntax in a file loaded as
  CommonJS". Harmless today; fixed by adding `"type": "module"` to `package.json`
  or renaming the config to `.mts`. Left alone — it touches the whole project's
  module resolution and belongs in its own change.
- ~~`docs/SCHEMA.md` lists `study_sessions` under the semester layer. It is not in
  slice 01's build list, so it was not created. Slice 07 (Focus) needs it.~~
  **Fixed in slice 07** — `supabase/migrations/004_study.sql` creates it, with
  RLS and four policies.
- `docs/DESIGN.md` contradicts itself on the type floor. The Type section says
  "never smaller than 12px anywhere"; the Measurements section then specifies
  12.5px course names, 11.5px room/time, and 11px mono gutter and uppercase
  labels. Slice 02 took the floor as the rule and added one exception,
  `text-label` (11px), for the uppercase mono labels the Fonts section
  explicitly specifies. **Slice 04 built the calendar to the floor** — see the
  decision above — so nothing in the app uses 12.5 or 11.5. Aadit still owes a
  one-line ruling: either delete those two numbers from DESIGN.md, or say the
  calendar is an exception and slice 04 needs revisiting.
- **Slice 03 was not deployed.** Step 5 of `prompts/03-today.md` — connect the
  repo to Vercel, set the env vars, confirm the live URL — needs an account
  this session cannot sign into. The app builds for production
  (`npm run build`) and nothing in it is local-only. Aadit does the deploy;
  remember `TZ` alongside the two `NEXT_PUBLIC_SUPABASE_*` vars and
  `SUPABASE_SERVICE_ROLE_KEY`, and add the deployed origin to Supabase's
  Auth → URL Configuration redirect list or the magic link will bounce.
- ~~`modules/tasks` can answer "due between these two dates" and nothing else,
  so /today's overdue section is capped at a 30-day lookback. Slice 06 owns
  tasks and should add a real "everything still open and past due" read;
  /today can then drop the window.~~ **Fixed in slice 06** — `getOverdueTasks`
  is that read, /today makes two calls instead of one, and
  `OVERDUE_LOOKBACK_DAYS` is gone from `lib/today.ts`.
- The Next.js dev-tools bubble sits on top of the first item in the mobile
  bottom nav at 390px. Development only — it is not in the production bundle —
  but it makes the nav awkward to click while developing on a narrow window.
- `app/favicon.ico` is still the scaffold's Next.js logo. The PWA icons
  generated in slice 03 are PNGs and are what `metadata.icons` points at, so
  the `.ico` only serves a bare `/favicon.ico` request. Replacing it needs an
  ICO encoder; not worth a slice of its own, worth ten minutes some day.
- ~~`app/login/page.tsx` and `app/today/page.tsx` are still slice-00
  placeholders.~~ **/today was rebuilt in slice 03.** `app/login/page.tsx` is
  still bare — unstyled borders and inputs, and its own comment still says
  "the design system arrives in slice 02". It sits outside the `(app)` route
  group so it gets no shell, and it is the only screen that renders before
  auth, so it wants a pass at some point. Slice 03 deliberately left it alone
  (rule 9).
- ~~There is no `Input` / `Textarea` primitive... slice 06 should add the
  primitive and replace both.~~ **Fixed in slice 06** — `components/ui/field.tsx`
  holds `Input`, `Textarea`, `Select` and `Field`; the add-a-one-off sheet,
  `/settings/semester` and `/notes` all use them, no `FIELD` string is left in
  the tree, and `/styleguide` has a "Form controls" section.
- `docs/DESIGN.md` contradicts itself on the accent, too. Neutrals says the
  accent appears "in exactly two places: something needs attention, and the
  now-line"; Measurements then asks for "a 4px accent dot under any day with
  classes" in the day view's date strip. Slice 04 used course-colour dots
  instead, to match the month view and keep the accent scarce (see the decision
  above). Worth a one-line ruling.
- `/settings/semester` is reachable only from a small "Semester" link in the
  calendar's header. The bottom nav is a four-column grid and a fifth
  destination would break it, so adding a real settings section is its own
  small piece of work — probably when slice 10 (BYOK settings) needs somewhere
  to live.
- The calendar's week grid does not scroll independently — the whole page
  scrolls. On a short laptop screen a term with an 08:00 class and a 19:00 one
  means scrolling the page to see the evening. A sticky day-heading row inside
  a scrolling grid would be nicer and is a self-contained change; it was not in
  the slice.
- `modules/courses` has no way to delete a meeting. A one-off added by mistake
  can be cancelled but not removed. A later calendar pass should add it; it
  needs a confirmation step, which is why it was not slipped in here. Slice 06
  did not do it either — it is a calendar change, not a tasks one, and
  `deleteTask` gave no reason to reopen `modules/courses`.
- Deleting a task on /tasks has no confirmation step. It is one tap inside a
  sheet that has to be opened first, and the copy beside it points at `dropped`
  as the non-destructive option, so it is hard to hit by accident — but a
  mis-tap is unrecoverable. Worth a confirm the next time these screens are
  touched.
- `getNoteRefs` resolves a lecture note by listing every meeting that has a note
  and filtering in memory. Correct, and fine at one student's scale, but it is a
  full read for what should be one indexed lookup. Adding
  `findMeetingByNoteBlock` to `modules/courses` would fix it; that is a change
  to another module and was not this slice's (rule 9).
- The quick-add parser understands English weekday and month names only, and
  reads `28/8` as day-first. Both are facts about this user, not about the code.
  If the app ever has a second user, they belong in a setting.
- `/tasks` fetches every task in the workspace on each render and narrows it in
  memory. That is the right trade at a few hundred rows — one query, instant
  filter switching — and the wrong one at ten thousand. The repo already has the
  indexes to push filters into SQL when that day comes.
- Completing a task from /today or a lecture page re-renders the whole page
  (`revalidatePath`). It is fast and needs no JavaScript, but the row does not
  tick until the round trip returns. An optimistic client row would feel better
  and would cost a `'use client'` on something that currently does not need one.
- The timer lives in one browser's `localStorage`. Starting a block on the
  laptop and finishing it on the phone does not work — the phone sees no block
  running. Correct for a single user with one device at a time, and fixing it
  properly means an open row in the database, which the decision above
  deliberately rejected. Worth revisiting only if it actually bites.
- A focus block that is logged and then navigated away from can never be rated.
  `setFocusRating` handles null and the row is perfectly editable, but the only
  place the question is asked is the card that appears immediately after the
  block ends. There is no history screen on /focus to go back to — and there
  should not be one yet (prompts/07-focus.md: no stats dashboard). If the rating
  turns out to be worth anything in slice 12, it needs somewhere to live.
- `/focus` is not in the bottom nav (see the decision above). If it turns out to
  be a daily destination rather than something started from /today, the nav
  needs a real rethink — six columns measured properly, or a "more" affordance —
  and `/settings/*` is waiting behind the same question.
- `getUnitStudy` reads every session in the workspace and aggregates in memory.
  Deliberate (see the decision above) and correct at a few thousand rows a year,
  but it is the read slice 12 leans on hardest, so it is the first one that will
  want pushing into SQL.
- **A syllabus unit cannot be deleted.** prompts/08-syllabus.md asks for "add,
  rename, reorder" and slice 08 built exactly those (rule 9). A unit typed in
  by mistake can be renamed into the one you meant, but a course whose syllabus
  turned out to have thirteen units rather than fourteen has a spare line on it
  forever. Deleting needs a confirmation step and a decision about what happens
  to the minutes, notes and tasks pointing at it — `on delete set null` on all
  four referencing columns says they survive and lose the link, which is
  probably right but is a product call, not a code one. Worth its own small
  piece of work.
- `/courses` and `/courses/[id]` each read the whole workspace's study
  sessions, tasks and (on the course page) notes, and narrow them in memory.
  That is the same trade `/tasks` and `modules/study` already make and it is
  correct at a few hundred rows, but `/courses` compounds it: it also asks for
  every course's units one query at a time. The indexes to push all of it into
  SQL exist; the day it matters, `getUnitStudy` is the first one to move.
- The syllabus add box posts one unit per Enter. Typing a fourteen-unit
  syllabus off a PDF is therefore fourteen round trips. Pasting a whole list
  and splitting it on newlines would be one, and `createSyllabusUnit` already
  appends, so it is a small change — it just was not asked for.
- **Slice 09's Google half could not be tested end to end in the session that
  built it.** There were no real Google OAuth credentials on this machine, so no
  live handshake was performed, the Google Picker was never opened, and no file
  was ever uploaded to a real Drive. What *was* proved: the authorize URL asks
  for `drive.file` and never a wider scope
  (`modules/google/drive-scope.test.ts`); encryption round-trips and refuses a
  tampered ciphertext (`lib/crypto.test.ts`); the routing rule and tile
  formatting (`lib/files.test.ts`); every ownership refusal and the RLS backstop
  against the real database, including as a signed-in anon-key user
  (`modules/files/file-attachments.test.ts`); and — against the running app,
  with a throwaway signed-in user since deleted — that `/settings/drive`,
  `/lecture/[id]`, `/today`, `/calendar`, `/tasks`, `/notes`, `/courses` and
  `/focus` all render correctly with no Drive account connected, that
  `/api/auth/google/start` redirects to Google asking for `drive.file` only,
  that a cancelled consent screen comes back as a plain sentence, and that
  `/api/drive/[id]` answers in plain text rather than an error page.
  **Aadit still owes the live pass**: `docs/GOOGLE_SETUP.md` step 8 is the
  checklist, and until it is done the connect flow, the Picker, the upload path
  and the `Recalc/<course code>/` folder are code that has never run against
  Google.
- `.env.local` holds **placeholder** `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` (`replace-me…`) so the app boots and builds. They must
  be replaced with real values from Google Cloud. `ENCRYPTION_KEY` was generated
  for real and **must be backed up** — losing it makes every stored token and,
  from slice 10, every stored API key unreadable.
- **Deleting a workspace leaves its images in the `note-images` bucket.**
  Supabase Storage has no foreign key to `workspaces`, so the cascade that
  cleans out `files` cannot reach the objects. `removeFile` deletes the object
  when a single image is removed, so this only bites when a whole workspace or
  auth user goes — which today happens only in tests, and
  `modules/files/file-attachments.test.ts` now sweeps the bucket in its own
  teardown for exactly that reason. A proper fix is a trigger on
  `workspaces` delete calling out to Storage, or a periodic sweep; both are
  their own small piece of work and would need a second migration in this slice.
- A pasted image lands in the lecture's Files grid rather than inline in the note
  document (see the decision above). Rendering it in place needs a TipTap image
  node, a rule for how `plainTextOf` treats it, and a way to re-sign the URL on
  every read. Worth its own small piece of work; it is not a files problem.
- `SETUP.md` section 3 still describes the Google Cloud setup, and now disagrees
  with `docs/GOOGLE_SETUP.md` in small ways (it lists three APIs including Gmail,
  and predates the exact redirect URI). Slice 09 wrote the new file rather than
  editing the old one (rule 9). Worth reducing section 3 to a pointer some day.
- The Drive folder lookup only ever finds folders this app created — that is what
  `drive.file` means. A `Recalc` folder made by hand in Drive is invisible to
  Recalc, so it would create a second one beside it. Correct, and a real
  consequence of the scope; the alternative is asking for the whole Drive.
  Worth a line in the setup doc if it ever confuses anyone.
- `getDriveAccessToken` refreshes the token on every operation rather than
  caching it. That is one extra round trip to Google per attach, upload or
  preview. Deliberate — a cached credential with a lifetime nobody tracks is
  worse than a round trip — but if the file grid ever gets slow, the thumbnails
  are what to look at: each one is its own request through
  `/api/drive/[fileId]`, and each mints its own token.
- Attached files are not checked against `isHandEdited` in
  `modules/courses.generateMeetings`. The 2026-08-24 decision on that said
  "`files` is not checked yet — the table lands in slice 09... Add the check when
  the files module exists." The table now exists. It was not added here because
  it is a change to `modules/courses`, not `modules/files` (rule 9), and in
  practice a file is always attached from a lecture page that also writes
  `note_block_id` — so the meeting is already protected. Worth closing properly
  the next time the calendar is opened.
- Nothing lists files at the *course* level. `getFilesForCourse` and
  `getFilesForBlock` exist and are tested through the module, but no screen calls
  them — `/courses/[id]` has no Files section. The slice asked for the lecture
  page and that is what was built.
- `components/today/task-row.tsx` and `components/tasks/task-item.tsx` are now
  two rows that look nearly the same. They differ in what they show (one is a
  seven-day view with no edit affordance) and merging them would mean one
  component with several "is it this screen" props, so they were left apart.
  Worth revisiting if a third task row ever appears.
- **Slice 10's live provider call has never been made.** There is no real
  Anthropic, Google or OpenAI key on this machine, so **"Test connection" has
  never reached a provider**. Everything up to the network is proved:
  role → provider → configured model routing for all three providers and both
  model kinds (`modules/agents/registry.test.ts`); encryption in, ciphertext
  in the database, mask out, and never the key
  (`modules/agents/agent-profiles.test.ts`); both pre-network refusals — an
  empty role and an unreadable ciphertext — returning a sentence without
  calling anything; RLS as a signed-in anon-key user; that no file outside
  `modules/agents` imports a provider SDK and no `'use client'` file or
  `/components` file reaches the module or `lib/crypto`
  (`modules/agents/no-provider-sdk.test.ts`); that `.next/static` contains no
  key material; and — against the running dev server, with a throwaway
  signed-in user since deleted — that `/today`, `/settings/agents`,
  `/settings/drive` and `/settings/semester` all render in both the
  no-key-configured and key-configured states, with the mask shown and neither
  the key nor the ciphertext anywhere in the HTML. **Aadit still owes the live
  pass**: paste a real key into `/settings/agents`, press Test connection, then
  switch that role's provider to Gemini and press it again.
- `ENCRYPTION_KEY` now protects **two** things — `google_accounts.refresh_token_enc`
  from slice 09 and `agent_profiles.api_key_enc` from slice 10. Losing it means
  re-connecting Drive *and* re-pasting three API keys. The 2026-08-27 note above
  already said to back it up; it is worth more now.
- There is still no real settings *section*. `/settings/agents`,
  `/settings/drive` and `/settings/semester` are three sibling pages that link
  to each other from their headers, and none of them is in the nav (the bottom
  bar is full at five columns). Three is about the limit of what that pattern
  carries; a fourth settings screen should probably come with a
  `/settings` index page or a nav rethink. The same open question already
  booked for `/focus` above.
- `testAgentConnection` sends a real prompt with `maxRetries: 0` and no
  timeout of its own. A provider that accepts the connection and then hangs
  will hold the Server Action open until the platform's own limit. The AI SDK
  takes a `timeout`, so this is a one-line fix — it was left out because a
  number picked without ever having watched the call succeed is a guess.
- ~~Nothing calls `getModel` yet except the Test connection button. The registry
  is built and proved, but slice 11 is the first real consumer, and the shape
  of "degrade with a clear message" will only be exercised properly when there
  is a feature to degrade. `AgentNotConfigured` and `AgentKeyUnreadable` exist
  for it to catch.~~ **Answered in slice 11** — see the entry near the bottom of
  this list.
- `MODEL_CHOICES` will go stale. It is three suggestions per provider, typed by
  hand from what each provider offered in August 2026, and nothing checks it
  against a live model list. The "or type a model id" box is the escape hatch
  and is why this is a nuisance rather than a bug — but a `GET /v1/models` per
  provider would keep the picker honest, and is worth doing the day one of
  these ids is retired.
- ~~Nothing calls `getModel` yet except the Test connection button... slice 11
  is the first real consumer.~~ **Slice 11 is that consumer** — through
  `generateWithRole`, which wraps `modelSpecFor` + `generateText` so the `ai`
  package stays inside `modules/agents` (see the decision above). Both named
  errors are caught by `worker.ts` and become a derivation's `error` status.
- **No summary in this project has ever been written by a real model.** There
  is still no Anthropic, Google or OpenAI key on this machine, and
  `agent_profiles` is empty. What *is* proved: the whole of `worker.ts` end to
  end against the real database and the real trigger, with only the provider's
  network faked through the AI SDK's own `MockLanguageModelV4`
  (`modules/recalc/recalc-engine.test.ts`, 20 tests) — status transitions, the
  receipt's versions and snapshots, the write through `modules/blocks`,
  regeneration being safe to run twice, the accept guard, every ownership
  refusal, and the failure path with *no* stand-in at all (the registry really
  is asked for the `deep` role and really does throw `AgentNotConfigured`, and
  the row ends at `error`); the diff (`lib/diff.test.ts`); and — against the
  running dev server, with a throwaway signed-in user since deleted — that
  `/review` renders a stale summary with a real word-level diff (`NOT` added,
  `cell.` struck through, `cell, despite the meme.` added), the note page shows
  its summary marked "Out of date", and the nav badge renders. **What is not
  proved is whether the summaries are any good**: the wording of the prompt in
  `recipes/summarize.ts`, whether 3–6 sentences is the right shape, whether
  `maxOutputTokens: 700` truncates a long lecture, and how a real provider's
  errors read on screen. All of that needs a key, and all of it is a wording
  change rather than a structural one.
- **A newly added paragraph does not stale its note's summary.** The cascade
  fires on a version bump of a block already on the receipt, and a brand-new
  paragraph is a brand-new block that no receipt names. Editing or emptying an
  existing paragraph works exactly as advertised; *adding* one is invisible
  until the next regeneration. Every live child is recorded precisely so that
  the case which *can* be caught is caught (see the decision above), but closing
  this properly needs the note document's own version to move when its set of
  children changes — which is a change to `modules/notes`/`modules/blocks`, not
  to `modules/recalc` (rule 9). It is the single biggest remaining hole in the
  product's central claim and deserves its own small piece of work.
- **Soft-deleting a paragraph does not stale anything either**, for the same
  reason: `softDeleteBlock` sets `deleted_at` and deliberately does not touch
  `version`, so the trigger never fires. `/review` renders such a source as
  "This paragraph has been deleted." if the derivation is stale for some other
  reason, but the deletion alone will not put it there. Same fix, same owner.
- Two *simultaneous* presses of Summarise on a note that has never been
  summarised could create two summary blocks. Sequential runs cannot — the
  second finds the first and reuses it, and there is a test for that — but there
  is no unique index to make it impossible, because there is no column to put
  one on (the note link lives in `derivation_sources`, see the decision above).
  One button, one user, one tab: not worth a migration today.
- `getReviewQueue` reads each stale derivation's sources, derived block and note
  one at a time. That is the same trade `/tasks` and `/courses` already make and
  it is correct at the handful of rows a stale queue should ever hold — if the
  queue is long enough for this to matter, the queue being long is the problem.
- The `(app)` layout now makes one extra query on every signed-in page render.
  It is a `count` on an existing index and it buys the badge on every screen,
  but it is the first time the shell touches the database at all, and it means
  every page pays for it whether or not the nav is visible.
- `AppNav`'s `built: false` branch (the small "soon" label) is now dead: all
  five destinations are built. Left in place because slice 12 adds Questions and
  will want it again; delete it if that turns out not to be true.
- Running the whole suite against the live Supabase project intermittently fails
  with `TypeError: fetch failed` or a 30s timeout when 27 files hit the remote
  project at once — it happened once during this slice and passed cleanly on a
  re-run. Nothing is wrong with the tests; the project is remote and vitest runs
  files in parallel. If it becomes routine, `maxConcurrency` or a
  `--pool=threads --poolOptions.threads.singleThread` run is the lever.
- **No answer in this project has ever been written by a real model.** Same gap
  as slice 11's summaries and for the same reason: there is still no provider key
  on this machine. What *is* proved, against the real database and the real
  trigger with only the provider's network faked, is the whole of slice 12's
  claim — the anchoring, the receipt naming exactly the question and its anchors,
  the cascade firing through `derivation_sources` and *not* through "an edit
  somewhere in the note", `/review` labelling it as an answer to its question,
  regeneration moving the receipt forward, and the lifecycle
  (`modules/recalc/answer-staleness.test.ts`, 12 tests) — plus the sentence's
  arithmetic without a database (`lib/questions.test.ts`). What is unproved is
  the wording in `recipes/answer.ts`: whether "2 to 5 short sentences" is the
  right shape, whether `maxOutputTokens: 600` truncates, and whether "if the
  notes do not contain the answer, say exactly what is missing" actually stops a
  model inventing. All of it is a wording change, not a structural one.
- `/review`'s "Did not finish" section still says "Open the note it belongs to
  and press **Summarise** again". For a failed *answer* the button to press is
  Answer, on the question, not Summarise on the note. It is one sentence of copy
  on slice 11's screen and the failure list does not yet say which recipe each
  row is, so fixing it properly means giving `getFailedDerivations` the same
  `recipe`/`question` treatment `getReviewQueue` got. Worth doing the next time
  that screen is opened.
- `AppNav`'s `built: false` branch is *still* dead. Slice 11 left it in on the
  grounds that "slice 12 adds Questions and will want it again" — it does not:
  questions are read on the lecture, note and course pages, and there is no
  `/questions` route at all (see the decision above). Nothing in the build order
  after this adds a sixth nav column either. Delete it.
- `getUnresolvedQuestions` reads **every** question in the workspace, resolves
  every answer and every note ref, and the course page then filters that list
  down to one course in memory. It is the same trade `/tasks`, `/courses` and
  `modules/study` already make, and at one student's scale it is a few hundred
  rows — but it is the first read that gets slower in proportion to *the whole
  semester* rather than to what is on screen. The indexes to push it into SQL
  are in migration 008; the query is not written.
- Two *simultaneous* presses of Answer on a question that has never been
  answered could create two answer blocks, exactly as slice 11 noted for
  Summarise, and for exactly the same reason: the link lives in
  `derivation_sources`, so there is no column to put a unique index on.
  Sequential runs are safe — the second finds the first and reuses it.
- A question asked in a note that is filed under no course lands under
  "Not filed under a unit" on *no* course page, so it is invisible everywhere
  except the note it was asked in. `getUnresolvedQuestions` returns it with
  `courseId: null` and every screen that groups by course drops it. Filing the
  note fixes it retroactively — a question's course and unit are read from the
  note every time, never copied — but nothing tells you the question is stranded.
- Editing a question is not possible, and `readAnswerSources` quietly depends on
  that: the question block is on the answer's receipt, so if anything ever *did*
  edit one, the answer would go stale with the question listed as "what changed
  in the note" — which is not where it belongs. `getReviewQueue` already lifts
  the question block out of the source list, so the screen is safe; the day a
  Rephrase button exists, this is the thing to check first.
- **No vector in this project has ever been produced by a real model.** Same gap
  as slices 10, 11 and 12, and for the same reason: there is still no Anthropic,
  Google or OpenAI key on this machine and `agent_profiles` is empty. What *is*
  proved, against the real database with only the provider's network faked
  through the AI SDK's own `MockEmbeddingModelV4`
  (`modules/search/search-staleness.test.ts`, 14 tests): the whole indexing pass,
  the derived queue returning exactly the block whose version moved and not the
  one beside it, the version-1 vector still sitting in `block_embeddings` after
  the edit while `current_block_embeddings` shows nothing for that block, the old
  wording being unfindable by a query that is a near-exact match for that stored
  vector, the new wording being findable by words in the same instant, the
  re-embed adding a second row without disturbing the first, the cleanup removing
  exactly the dead row and changing no answer search gives, and the whole thing
  degrading to a plain word search with the *real* `embedWithRole` when the embed
  role is empty. What is unproved is whether a real provider's vectors rank
  anything sensibly, and whether a real embed model returns 1536 numbers — see
  the next item. Paste a key into `/settings/agents` for the `embed` role and
  press **Update the index** on `/search`.
- **`vector(1536)` is a hard width, and Google's embedding models are 768.**
  docs/SCHEMA.md picked 1536 and the column enforces it, so an embed role filled
  by Gemini stores nothing: `toVectorLiteral` refuses and the screen says which
  model returned how many numbers and what to do about it. OpenAI's
  `text-embedding-3-small` is 1536 and works. The real fixes are either a
  `dimensions` request parameter where the provider supports one, or a second
  column — both are schema changes and neither belongs in a slice that has spent
  its migration.
- The semantic half has no distance floor: it returns the `p_limit` nearest
  vectors whatever their distance, so in a workspace with a handful of notes
  *every* note comes back for *any* query, ranked. Reciprocal rank fusion keeps
  the real matches on top and the effect disappears as the workspace grows past
  a screenful, which is why it was left — but a `p_min_similarity` argument to
  `search_blocks` is the honest fix, and it is a `create or replace` in whichever
  migration comes next.
- A search result links to the *note* the passage lives in, not to the passage
  itself. prompts/13-search.md asks for "linking into the note at the right
  place" and this is the half of it that is not built: the editor renders each
  paragraph with `data-block-id` but no `id`, and it mounts after hydration
  (`immediatelyRender: false`), so a `#fragment` link would have nothing to
  scroll to at load. Doing it properly means the note editor scrolling to and
  briefly marking a named block after it mounts — a change to
  `components/notes/note-editor.tsx`, which is slice 05's file (rule 9). The hit
  shows the passage's own words, so it is findable by eye on arrival.
- `countPendingEmbeddings` counts by fetching up to 200 pending rows and reading
  `.length`, because the queue is a set-returning function and PostgREST cannot
  ask it for a `count`. It is right at the scale it runs at and wrong past 200,
  where the screen will simply say 200. A `count(*)` wrapper is one more SQL
  function whenever a migration is open.
- `search_blocks` and `pending_embeddings` index six block types —
  `text`, `heading`, `note`, `summary`, `question`, `answer` — but the screen
  drops everything that does not resolve to a note (see the decision above), so
  summaries, questions and answers are embedded and then never shown. That is
  the user's API credits paying for rows nothing reads. Narrowing
  `pending_embeddings` to `('text', 'heading', 'note')` is a one-line
  `create or replace`; it was not done here because migration 009 is applied and
  rule 3 says never edit an applied migration.
- The version predicate makes the HNSW index unusable on its own: the semantic
  half joins `block_embeddings` to `blocks` to compare versions, so Postgres
  cannot answer it from the vector index alone and scans instead. Correct, and
  fine at one student's scale; if it ever is not, the lever is a partial index
  or a `current_version` column maintained by a trigger — and the second of
  those is a new fact that can disagree with `blocks.version`, so think hard
  before reaching for it.
