# Recalc

A study workspace whose AI-generated content knows when its sources have changed.

Single user (Aadit). Web app + PWA. Built one slice at a time, in order.

- `docs/PRODUCT.md` — what we're building and why. Read once per session.
- `docs/SCHEMA.md` — the data model. Read before touching the database.
- `docs/DESIGN.md` — the design system and the calendar spec. **Read before building
  any screen.** It is a specification, not a mood board.
- `docs/SLICES.md` — the build order and where we currently are.
- `docs/DECISIONS.md` — append here whenever you make an architectural call.

---

## The invariant this project exists to protect

**Editing a source block marks every derivation that read an older version of it as stale.**

There is a test for this at `modules/recalc/staleness.test.ts`. If it ever fails,
stop whatever you are doing and fix it before anything else. Everything in this
product is downstream of that one behaviour.

---

## Never

1. **Never import across a module boundary except from its `index.ts`.**
   `import { getBlock } from '@/modules/blocks'` — yes.
   `import { getBlock } from '@/modules/blocks/repo'` — no. There is a lint rule.
2. **Never touch the database outside `modules/*/repo.ts`.** No Supabase client in
   a page, a component, a route handler, or a service. Repos only.
3. **Never edit a migration that has already been applied.** Add a new one.
4. **Never put an API key, service-role key, or OAuth token in a file containing
   `'use client'`**, or anywhere under `/components`. Secrets are server-side only.
5. **Never `UPDATE blocks` directly.** Go through `blocks.service` so `version` and
   `content_hash` stay correct. A direct update silently breaks the invariant above.
6. **Never name a model in app code.** Ask `agents.registry` for a role:
   `fast`, `deep`, or `embed`. The user picks which model fills each role.
7. **Never put a raw colour, font size or spacing value in a component.** Everything
   comes from the tokens built in slice 02. A hex code outside the token file is a bug.
8. **Never create a table without Row Level Security enabled and a policy on it.**
   The Supabase anon key ships to the browser. No RLS means the data is public.
9. **Never refactor, rename, reorganise, or "improve" code outside the slice you
   were asked for.** If you spot something wrong elsewhere, write it in
   `docs/DECISIONS.md` under "Noticed, not fixed" and move on.
10. **Never add a dependency** without a one-line justification in `docs/DECISIONS.md`.
11. **Never mark a slice done while `npm run check` fails.**

---

## Always

- **One slice per session.** When the slice is done, say so and stop. Do not begin
  the next one, even if it seems small. Do not add features that were not asked for.
- **One migration per slice**, numbered next in sequence.
- **Regenerate types after any migration**: `npm run db:types`.
- **Write the test for this slice's invariant** before calling it finished.
- **Prefer boring, obvious code.** This is read by a tired student, not a compiler.
  Clever is a bug.
- **Server Components by default.** Add `'use client'` only where you actually need
  interactivity, and keep those components small and leaf-level.

---

## Stack — do not substitute

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript strict |
| Styling | Tailwind |
| Database / Auth / Storage | Supabase (Postgres + pgvector) |
| DB access | `@supabase/supabase-js` + raw SQL migrations via Supabase CLI. **No ORM.** |
| Editor | TipTap (ProseMirror) |
| AI | Vercel AI SDK, multi-provider, user's own keys |
| Tests | Vitest |
| Hosting | Vercel |

If you think something here is wrong, say so and wait. Do not swap it out yourself.

---

## Layout

```
/app          Next.js routing ONLY. No business logic, no DB calls.
/modules      All business logic. Each module is self-contained.
  <name>/
    schema.ts   zod schemas + inferred types
    repo.ts     the only file that touches this module's tables
    service.ts  business logic
    index.ts    the public API — the only importable file
/components   Presentational only. No data fetching, no secrets.
/lib          db clients, env validation, shared utils
/supabase/migrations   numbered SQL, append-only
/docs
```

---

## Commands

```bash
npm run dev        # local dev server
npm run check      # typecheck + lint + tests — must pass before a slice is done
npm run db:push    # apply migrations to Supabase
npm run db:types   # regenerate TypeScript types from the database
```

---

## When you're unsure

Ask one question, then wait for the answer. Do not guess at a product decision and
build around the guess — a wrong guess costs an evening to unpick, a question costs
thirty seconds.

## At the end of every slice

Print a short summary in this shape:

```
SLICE <n> DONE
Built:      <one line>
Migration:  <filename, or none>
Test added: <filename, or none>
Check this yourself: <the exact thing Aadit should click/see to confirm it works>
Decisions logged: <yes/no>
```

Then stop.
