-- 008_questions.sql — slice 12
--
-- A question is a `blocks` row of type 'question'. `blocks.type` has listed
-- both 'question' and 'answer' since migration 001, so nothing new is needed to
-- STORE one — the same reasoning slice 05 applied to note documents.
--
-- Two things are missing, and each one has an exact precedent in this schema:
--
--   1. A question's lifecycle status. `standalone_notes` (003) indexes blocks of
--      one type with the small amount of feature-specific metadata that type
--      needs, rather than adding nullable, type-specific columns to `blocks`
--      itself. `questions` does the same for question blocks: one row per
--      question block, carrying `status` and nothing else that is not already
--      on the block.
--
--   2. What a question is anchored to. `derivation_sources` (001) links one row
--      to the many blocks it was built from. `question_anchors` is the same
--      shape — a join table with no id of its own and a composite primary key —
--      minus the version column, because an anchor is not a receipt: it records
--      what the question is ABOUT, which does not change when the paragraph is
--      edited. The receipt of what an answer actually READ stays in
--      `derivation_sources`, where the staleness cascade can see it.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- questions — the lifecycle, indexed against the question block
-- ---------------------------------------------------------------------------

create table questions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- The question block. Destroying the block removes the index entry; blocks
  -- are soft-deleted everywhere in this app, so in practice it never fires.
  block_id     uuid not null references blocks(id) on delete cascade,
  -- open     — asked, never answered
  -- answered — a derivation produced an answer. Still an open loop.
  -- resolved — I pressed the button. NEVER set automatically.
  status       text not null default 'open'
                 check (status in ('open', 'answered', 'resolved')),
  created_at   timestamptz not null default now()
);

-- One lifecycle row per question block, exactly as standalone_notes has one
-- index entry per note document. Two rows would let a question be open and
-- resolved at the same time.
create unique index questions_block_id_key on questions (block_id);
-- "How many unresolved questions are there" is the read the course page and the
-- payoff sentence are built on.
create index on questions (workspace_id, status);
create index on questions (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- question_anchors — which blocks a question is about
-- ---------------------------------------------------------------------------

create table question_anchors (
  question_block_id uuid not null references blocks(id) on delete cascade,
  anchored_block_id uuid not null references blocks(id) on delete cascade,
  primary key (question_block_id, anchored_block_id)
);
-- The downstream half: "what has been asked about this paragraph".
create index on question_anchors (anchored_block_id);

comment on table question_anchors is
  'Which blocks a question is about. Not a receipt: the versions an answer actually read live in derivation_sources, which is what the staleness cascade fires on.';

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table questions enable row level security;
alter table question_anchors enable row level security;

-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row.

create policy questions_select on questions for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy questions_insert on questions for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy questions_update on questions for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy questions_delete on questions for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

-- question_anchors has no workspace_id; ownership flows through the question
-- block, exactly as derivation_sources' ownership flows through its derivation.
create policy question_anchors_select on question_anchors for select to authenticated
  using (question_block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy question_anchors_insert on question_anchors for insert to authenticated
  with check (question_block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy question_anchors_update on question_anchors for update to authenticated
  using (question_block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))))
  with check (question_block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy question_anchors_delete on question_anchors for delete to authenticated
  using (question_block_id in (
    select id from blocks
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
