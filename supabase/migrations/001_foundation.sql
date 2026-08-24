-- 001_foundation.sql — slice 00
-- Core tables, the derivation engine, and the staleness cascade from docs/SCHEMA.md,
-- plus Row Level Security on everything. Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- Core
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My workspace',
  created_at  timestamptz not null default now()
);
-- RLS filters on owner_id; without this every policy check is a seq scan.
create index workspaces_owner_id_idx on workspaces (owner_id);

-- THE PRIMITIVE. Everything in the app is a row here.
create table blocks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  parent_id     uuid references blocks(id) on delete cascade,
  position      numeric not null,     -- fractional index: insert at midpoint, never renumber
  type          text not null,        -- text|heading|todo|course|unit|email|summary|question|answer|flashcard
  content       jsonb not null default '{}',
  version       int  not null default 1,   -- bumps ONLY on semantic change
  content_hash  text not null,             -- sha256 of NFKC-normalised, whitespace-collapsed text
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                -- soft delete: never destroy provenance
);
create index on blocks (workspace_id, parent_id, position);
create index on blocks (workspace_id, type) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- The engine
-- ---------------------------------------------------------------------------

create table derivations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  derived_block_id uuid not null references blocks(id) on delete cascade,
  recipe           text not null,   -- summarize|flashcards|answer|extract|plan
  model            text not null,   -- recorded for audit; app code never chooses this
  prompt_version   int  not null default 1,
  status           text not null default 'fresh',  -- fresh|stale|computing|error
  error            text,
  computed_at      timestamptz
);
create index on derivations (workspace_id, status);

create table derivation_sources (
  derivation_id   uuid not null references derivations(id) on delete cascade,
  source_block_id uuid not null references blocks(id) on delete cascade,
  source_version  int  not null,    -- the version this was computed against
  primary key (derivation_id, source_block_id)
);
create index on derivation_sources (source_block_id);

-- ---------------------------------------------------------------------------
-- The cascade — this trigger is the product
-- ---------------------------------------------------------------------------

-- search_path pinned and tables schema-qualified so the function cannot be
-- hijacked by objects in another schema.
create or replace function mark_derivations_stale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.derivations d
     set status = 'stale'
   where d.status = 'fresh'
     and exists (
       select 1 from public.derivation_sources s
        where s.derivation_id  = d.id
          and s.source_block_id = NEW.id
          and s.source_version  < NEW.version
     );
  return NEW;
end $$;

create trigger blocks_version_cascade
  after update of version on blocks
  for each row when (OLD.version is distinct from NEW.version)
  execute function mark_derivations_stale();

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table workspaces enable row level security;
alter table blocks enable row level security;
alter table derivations enable row level security;
alter table derivation_sources enable row level security;

-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row.

create policy workspaces_select on workspaces for select to authenticated
  using (owner_id = (select auth.uid()));
create policy workspaces_insert on workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy workspaces_update on workspaces for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy workspaces_delete on workspaces for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy blocks_select on blocks for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy blocks_insert on blocks for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy blocks_update on blocks for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy blocks_delete on blocks for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

create policy derivations_select on derivations for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy derivations_insert on derivations for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy derivations_update on derivations for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy derivations_delete on derivations for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

-- derivation_sources has no workspace_id; ownership flows through the derivation.
create policy derivation_sources_select on derivation_sources for select to authenticated
  using (derivation_id in (
    select id from derivations
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy derivation_sources_insert on derivation_sources for insert to authenticated
  with check (derivation_id in (
    select id from derivations
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy derivation_sources_update on derivation_sources for update to authenticated
  using (derivation_id in (
    select id from derivations
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))))
  with check (derivation_id in (
    select id from derivations
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy derivation_sources_delete on derivation_sources for delete to authenticated
  using (derivation_id in (
    select id from derivations
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
