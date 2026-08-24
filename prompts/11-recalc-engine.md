# Slice 11 — The recalc engine

Read `CLAUDE.md`, `docs/PRODUCT.md` and `docs/SCHEMA.md` in full. **This is the slice
the entire product exists for.** Take it slowly. If anything is ambiguous, ask me
before building.

## Goal

I edit a lecture note, the AI summary built from it flags itself as out of date, and
one click brings it back with a visible before/after.

## Build

1. **`modules/recalc`**:
   - `graph.ts` — resolve a derivation's sources, and find all derivations downstream
     of a given block
   - `staleness.ts` — read the stale queue; the marking itself is the DB trigger and
     must stay there
   - `recipes/summarize.ts` — first recipe: given source blocks, produce a summary
     block. Recipes declare their inputs so the engine can write
     `derivation_sources` correctly. **Recipes never write to the database
     themselves** — they return content, the engine persists it.
   - `worker.ts` — run one derivation: mark `computing`, call the model via
     `agents.registry.getModel('deep')`, write the derived block, write the source
     rows with the versions actually read, mark `fresh`. On failure, mark `error`
     with the message. Never leave a derivation stuck in `computing`.

2. **Generate a summary** — on a note, a "summarise this" action creating a summary
   block plus its derivation and source rows.

3. **`/review`** — the stale queue. For each stale item:
   - what it is and which note it belongs to
   - **which sources changed, and a diff of what changed in them**
   - the current derived content, and the regenerated version side by side
   - Accept / Keep old / Delete

4. **Badge** — a count of stale items in the nav. This is the number that makes me
   open the app.

5. **Tests**:
   - a real edit to a source marks its derivation stale
   - a whitespace edit does not
   - regenerating writes the new source versions, and status returns to `fresh`
   - a failed model call leaves status `error`, not `computing`

## Constraints

- **Nothing regenerates automatically.** Stale items wait for me. This is a product
  decision, not a performance one — read PRODUCT.md rule 2.
- The trigger stays in the database. Do not reimplement marking in TypeScript.
- Regeneration must be safe to run twice without duplicating blocks.

## Definition of done

I will: summarise a lecture note, then go back and change a sentence in that note,
and watch the summary appear in `/review` marked out of date, showing me exactly what
changed. Then accept the new version and see it go fresh.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
