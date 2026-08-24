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

---

## Noticed, not fixed

Things spotted outside the current slice. Do not fix them mid-slice; write them here.

- Migration 001 was applied by pasting it into the Supabase SQL editor, so the CLI's
  migration history table does not record it. Before slice 01's `npm run db:push`,
  run `npx supabase migration repair --status applied 001` once in a normal terminal
  (it prompts for the database password). Otherwise push will try to re-apply 001
  and fail on "table already exists".
