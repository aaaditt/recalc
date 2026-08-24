# Slice 00 — Foundation

Read `CLAUDE.md`, `docs/PRODUCT.md` and `docs/SCHEMA.md` before writing anything.

## Goal

A running Next.js app I can log into, with the blocks + engine tables live in
Supabase, and a passing test proving the staleness cascade works.

## Build

1. **Scaffold** — Next.js (App Router, TypeScript strict, Tailwind, `src/` dir off,
   import alias `@/*`). Add Vitest.

2. **Project structure** — create the folders from CLAUDE.md: `/modules`,
   `/components`, `/lib`, `/supabase/migrations`. Add `.gitignore` covering
   `.env*.local`.

3. **Env validation** — `lib/env.ts` that parses `process.env` with zod and throws a
   clear error at boot if anything is missing. Separate the server-only vars so they
   can never be imported into a client bundle.

4. **Supabase clients** — `lib/supabase/server.ts` (cookie-based, for Server
   Components and route handlers) and `lib/supabase/admin.ts` (service-role,
   `import 'server-only'` at the top).

5. **Auth** — Supabase magic-link email. A `/login` page, a callback route, and
   middleware that redirects unauthenticated users to `/login`. On first login,
   create a `workspaces` row for the user if none exists.

6. **Migration 001** — exactly the SQL in `docs/SCHEMA.md` under "Core", "The engine",
   and "The cascade": `workspaces`, `blocks`, `derivations`, `derivation_sources`, the
   `mark_derivations_stale()` function and the `blocks_version_cascade` trigger.
   Enable RLS on all four tables with policies scoped to the owning user.

7. **The blocks module** — `modules/blocks/` with `schema.ts`, `repo.ts`,
   `service.ts`, `index.ts`. `service.ts` owns:
   - `normalise()` and `hashContent()` exactly as specified in SCHEMA.md
   - `createBlock()`, `updateBlock()` — `updateBlock` recomputes the hash, and bumps
     `version` **only** when the hash actually changed
   - fractional `position` handling for insert-between

8. **The boundary lint rule** — ESLint `no-restricted-imports` blocking
   `@/modules/*/*` with the message "Import from the module index only".

9. **The test that matters** — `modules/recalc/staleness.test.ts`:
   - create a source block and a derived block with a derivation reading it at v1
   - update the source block with a **whitespace-only** change → assert version is
     still 1 and the derivation is still `fresh`
   - update it with a **real content** change → assert version is 2 and the
     derivation is now `stale`

10. **Scripts** in package.json: `dev`, `check` (typecheck + lint + vitest run),
    `db:push`, `db:types`.

## Constraints

- No UI beyond `/login` and a bare `/today` that just says hello and shows my email.
- No business logic in `/app`.
- Every table gets RLS. No exceptions.

## Definition of done

I will: run `npm run dev`, log in with a magic link, land on `/today` and see my
email address. Then run `npm run check` and see everything pass.

## Then

Update `docs/SLICES.md` to mark slice 00 done. Print the slice summary from
CLAUDE.md. **Stop — do not start slice 01.**
