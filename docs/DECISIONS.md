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
- `components/today/task-row.tsx` and `components/tasks/task-item.tsx` are now
  two rows that look nearly the same. They differ in what they show (one is a
  seven-day view with no edit affordance) and merging them would mean one
  component with several "is it this screen" props, so they were left apart.
  Worth revisiting if a third task row ever appears.
