# Slice 13 — Search

Read `CLAUDE.md` and the "Search" section of `docs/SCHEMA.md` first.

## Goal

I can find anything I have written, and a passage I edited five minutes ago is
already findable in its new form.

## Build

1. **Migration** — `block_embeddings` per SCHEMA.md, keyed on (block_id, version),
   with an appropriate vector index.

2. **Embedding on change** — when a block's version bumps, queue it for re-embedding.
   Only changed blocks get re-embedded. Use `agents.registry.getModel('embed')`.

3. **Hybrid search** — Postgres full-text plus vector similarity, merged. Queries
   must only consider rows where `block_embeddings.version = blocks.version`.

4. **Search UI** — one input, results grouped by course, each showing the block's
   context and linking into the note at the right place.

5. **Cleanup** — a job that deletes embedding rows whose version is behind the
   block's current version.

## Constraints

- Never return a result from a stale embedding row. That would be the exact bug this
  whole product exists to prevent.
- Do not build filters, facets, or a search settings page. One input.

## Definition of done

I will: edit a sentence in an old note, wait a moment, search for the new wording,
and find it — and search for the old wording and not find it.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
