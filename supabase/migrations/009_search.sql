-- 009_search.sql — slice 13
--
-- Search, and the one thing that makes it different from every other search box:
-- an embedding is stored against the VERSION of the block it was computed from,
-- and nothing may read one whose version is behind the block's current version.
--
--   docs/SCHEMA.md: "Query only rows where block_embeddings.version =
--   blocks.version. Old rows are harmless leftovers; a cleanup job can delete
--   them later."
--
-- That predicate is stated exactly once in this file — in the view
-- `current_block_embeddings` — and every read path goes through it. A predicate
-- repeated in three queries is a predicate that will be forgotten in a fourth,
-- and forgetting it means search returns a passage that was deleted five
-- minutes ago, which is the precise bug this whole product exists to prevent.
--
-- pgvector is NOT enabled here. Migration 001 already did it
-- (`create extension if not exists vector with schema extensions`), which is
-- why every vector type and operator below is spelled `extensions.`.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- The text a block is searched by
--
-- `blocks.content` is jsonb in one of two shapes (modules/blocks/schema.ts):
--
--   { "text": "..." }   a plain block — a note's title, a question, a summary
--   a TipTap node       { type, attrs, content: [ { type: 'text', text } ] }
--
-- This walks the second and reads the first, taking only the words. It is the
-- SQL twin of `plainTextOf` in modules/blocks/service.ts, and it takes only
-- text for the same reason that one does: node types, marks and the blockId
-- attribute are not words, and indexing them would make a search for "text" or
-- "paragraph" match every note in the workspace.
--
-- plpgsql rather than sql because it recurses, and a `language sql` body is
-- parsed at creation time, when the function does not exist yet.
-- IMMUTABLE because a full-text index is built on it, and an index expression
-- must be.
-- ---------------------------------------------------------------------------

create or replace function public.block_plain_text(content jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  child jsonb;
  parts text := '';
begin
  if content is null then
    return '';
  end if;

  -- A text leaf, and the plain { "text": "..." } shape, are the same read.
  if jsonb_typeof(content -> 'text') = 'string' then
    return content ->> 'text';
  end if;

  if jsonb_typeof(content -> 'content') = 'array' then
    for child in select * from jsonb_array_elements(content -> 'content') loop
      parts := parts || ' ' || public.block_plain_text(child);
    end loop;
  end if;

  return btrim(parts);
end $$;

comment on function public.block_plain_text(jsonb) is
  'The searchable words of a block, from either content shape. The SQL twin of plainTextOf in modules/blocks.';

-- The lexical half of hybrid search. Partial on `deleted_at is null` because a
-- soft-deleted paragraph is never a search result — the row survives so that a
-- derivation's receipt keeps its provenance, not so it can be found again.
create index blocks_search_idx on public.blocks
  using gin (to_tsvector('english', public.block_plain_text(content)))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- block_embeddings — docs/SCHEMA.md, "Search — versioned, so stale embeddings
-- are provably dead"
--
-- Keyed on (block_id, version). Editing a block bumps its version, so the next
-- embedding is a NEW row rather than an overwrite: the old vector stays in the
-- table, provably unreachable, until the cleanup job removes it. That is the
-- difference between "we delete the old one on write" and "the old one cannot
-- be read" — the first is a promise, the second is a schema.
--
-- Two columns beyond what SCHEMA.md lists, both load-bearing:
--   model      — vectors from two different models are not comparable, so a
--                row has to say which one produced it.
--   created_at — "indexed 3 minutes ago" on the search screen.
-- ---------------------------------------------------------------------------

create table block_embeddings (
  block_id   uuid not null references blocks(id) on delete cascade,
  version    int  not null,
  embedding  extensions.vector(1536) not null,
  model      text not null,
  created_at timestamptz not null default now(),
  primary key (block_id, version)
);

-- HNSW rather than ivfflat: ivfflat needs rows in the table before its lists
-- mean anything, and this table starts empty and stays small. Cosine, because
-- every provider's embeddings are compared that way.
create index block_embeddings_hnsw_idx on block_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

comment on table block_embeddings is
  'One vector per (block, version). A row whose version is behind blocks.version is dead: read only through current_block_embeddings.';

-- ---------------------------------------------------------------------------
-- THE PREDICATE, stated once
--
-- security_invoker so the view is not a hole around RLS: it is read as whoever
-- is asking, and the policies on `blocks` and `block_embeddings` both apply.
-- ---------------------------------------------------------------------------

create view current_block_embeddings
with (security_invoker = on) as
  select e.block_id,
         e.version,
         e.embedding,
         e.model,
         e.created_at,
         b.workspace_id
    from block_embeddings e
    join blocks b
      on b.id = e.block_id
     -- This line is the slice.
     and b.version = e.version
   where b.deleted_at is null;

comment on view current_block_embeddings is
  'Embeddings whose version matches their block''s. The only supported way to read block_embeddings — a row that is behind is unreachable through here.';

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
--
-- block_embeddings has no workspace_id; ownership flows through the block,
-- exactly as question_anchors' flows through its question block (008).
-- ---------------------------------------------------------------------------

alter table block_embeddings enable row level security;

create policy block_embeddings_select on block_embeddings for select to authenticated
  using (block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy block_embeddings_insert on block_embeddings for insert to authenticated
  with check (block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy block_embeddings_update on block_embeddings for update to authenticated
  using (block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))))
  with check (block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy block_embeddings_delete on block_embeddings for delete to authenticated
  using (block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));

-- ---------------------------------------------------------------------------
-- The queue: which blocks are waiting to be embedded
--
-- There is no queue table and no enqueueing trigger, on purpose. A block is
-- waiting for an embedding exactly when it has no row at its CURRENT version —
-- which is the same version comparison the whole slice turns on, asked the
-- other way round. Bumping a version therefore enqueues the block by
-- definition, with nothing to write, nothing to miss and nothing that can drift
-- out of step with the truth. Only changed blocks come back from here: an
-- untouched block already has a row at its current version.
--
-- Types are filtered to the ones that hold writing. A `course` or `unit` block
-- is a name, and a note document's title is already carried by the note.
-- ---------------------------------------------------------------------------

create or replace function public.pending_embeddings(
  p_workspace_id uuid,
  p_limit        int default 50
)
returns table (block_id uuid, version int, plain_text text)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.version, public.block_plain_text(b.content)
    from public.blocks b
   where b.workspace_id = p_workspace_id
     and b.deleted_at is null
     and b.type in ('text', 'heading', 'note', 'summary', 'question', 'answer')
     and btrim(public.block_plain_text(b.content)) <> ''
     and not exists (
       select 1
         from public.block_embeddings e
        where e.block_id = b.id
          and e.version  = b.version
     )
   order by b.updated_at desc
   limit greatest(p_limit, 1)
$$;

comment on function public.pending_embeddings(uuid, int) is
  'Blocks with no embedding at their current version. The queue, derived rather than stored, so a version bump enqueues by definition.';

-- ---------------------------------------------------------------------------
-- Hybrid search
--
-- Postgres full text plus vector similarity, merged by reciprocal rank fusion:
-- each half contributes 1 / (60 + its rank), and the two are added. RRF is used
-- rather than a weighted blend of the two scores because ts_rank and cosine
-- distance are not on the same scale and never will be — ranks are.
--
-- Both halves are version-current, and each in its own way:
--
--   lexical  — reads `blocks` itself, so the words being matched ARE the
--              current version's words. Editing a sentence makes the old
--              wording unmatchable in the same statement that saves it.
--   semantic — reads `current_block_embeddings`, never `block_embeddings`, so
--              a vector computed from an older version cannot be reached.
--
-- `p_embedding` may be null: with no embed role configured — or no provider key
-- on the machine at all — the semantic half contributes nothing and search is
-- pure full text. It degrades, it does not break.
-- ---------------------------------------------------------------------------

create or replace function public.search_blocks(
  p_workspace_id uuid,
  p_query        text,
  p_embedding    extensions.vector(1536) default null,
  p_limit        int default 30
)
returns table (
  block_id   uuid,
  parent_id  uuid,
  block_type text,
  version    int,
  plain_text text,
  lexical    boolean,
  semantic   boolean,
  score      real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with tsq as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as q
  ),
  lexical as (
    select id, pos from (
      select b.id,
             row_number() over (
               order by ts_rank(
                          to_tsvector('english', public.block_plain_text(b.content)),
                          tsq.q
                        ) desc,
                        b.updated_at desc
             ) as pos
        from public.blocks b
       cross join tsq
       where b.workspace_id = p_workspace_id
         and b.deleted_at is null
         and to_tsvector('english', public.block_plain_text(b.content)) @@ tsq.q
    ) ranked
    where pos <= greatest(p_limit, 1) * 4
  ),
  semantic as (
    select id, pos from (
      select e.block_id as id,
             row_number() over (
               order by e.embedding OPERATOR(extensions.<=>) p_embedding
             ) as pos
        -- The view, never the table.
        from public.current_block_embeddings e
       where p_embedding is not null
         and e.workspace_id = p_workspace_id
    ) ranked
    where pos <= greatest(p_limit, 1) * 4
  ),
  merged as (
    select coalesce(l.id, s.id)   as id,
           (l.pos is not null)    as lexical,
           (s.pos is not null)    as semantic,
           (coalesce(1.0 / (60 + l.pos), 0) + coalesce(1.0 / (60 + s.pos), 0))::real as score
      from lexical l
      full outer join semantic s on s.id = l.id
  )
  select m.id,
         b.parent_id,
         b.type,
         b.version,
         public.block_plain_text(b.content),
         m.lexical,
         m.semantic,
         m.score
    from merged m
    join public.blocks b on b.id = m.id
   where b.deleted_at is null
   order by m.score desc, b.updated_at desc
   limit greatest(p_limit, 1)
$$;

comment on function public.search_blocks(uuid, text, extensions.vector, int) is
  'Hybrid search. The lexical half reads live blocks; the semantic half reads current_block_embeddings. Neither can return a result computed from a stale embedding.';

-- ---------------------------------------------------------------------------
-- Cleanup
--
-- Deletes exactly the rows the reads already cannot see: an embedding whose
-- version is behind its block's. Nothing that is reachable is ever removed, so
-- this job is safe to run at any moment and safe to never run at all — it
-- reclaims space, it does not enforce anything. The enforcement is the view.
-- ---------------------------------------------------------------------------

create or replace function public.delete_stale_embeddings(p_workspace_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  removed integer;
begin
  with dead as (
    select e.block_id, e.version
      from public.block_embeddings e
      join public.blocks b on b.id = e.block_id
     where b.workspace_id = p_workspace_id
       and e.version < b.version
  )
  delete from public.block_embeddings e
   using dead d
   where e.block_id = d.block_id
     and e.version  = d.version;

  get diagnostics removed = row_count;
  return removed;
end $$;

comment on function public.delete_stale_embeddings(uuid) is
  'Removes embedding rows whose version is behind their block''s. Housekeeping only — those rows are already unreadable through current_block_embeddings.';
