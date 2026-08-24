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
- `docs/SCHEMA.md` lists `study_sessions` under the semester layer. It is not in
  slice 01's build list, so it was not created. Slice 07 (Focus) needs it.
- `docs/DESIGN.md` contradicts itself on the type floor. The Type section says
  "never smaller than 12px anywhere"; the Measurements section then specifies
  12.5px course names, 11.5px room/time, and 11px mono gutter and uppercase
  labels. Slice 02 took the floor as the rule and added one exception,
  `text-label` (11px), for the uppercase mono labels the Fonts section
  explicitly specifies. Whoever builds the calendar in slice 04 should get a
  ruling on 12.5 / 11.5 rather than inventing tokens for them.
- `app/login/page.tsx` and `app/today/page.tsx` are still slice-00 placeholders
  with unstyled borders and inputs; their own comments say "bare on purpose —
  the design system arrives in slice 02". Slice 02 built the system but not
  screens, so only the one class that the new type scale removed (`text-xl` ->
  `text-20`) was touched. Slice 03 should rebuild `/today` properly, and the
  login screen wants a pass at some point since it is the only screen that
  renders before auth.
- There is no `Input` / `Textarea` primitive. Nothing in slices 00–02 has a form
  worth styling; slice 06 (Tasks) is the first that does, and it should add them
  to `/components/ui` and to `/styleguide` rather than styling inputs inline.
