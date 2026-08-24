-- 003_notes.sql — slice 05
--
-- A note document is a `blocks` row of type 'note' whose children are its
-- paragraphs. Nothing new is needed to store one.
--
-- What is needed is a way to FIND the ones that do not belong to a lecture.
-- A lecture note is found through class_meetings.note_block_id, which already
-- exists. A free-standing note — "Formula sheet", "Reading week plan" — has no
-- lecture to hang off, so this table is where it is indexed, and where its
-- course and (optional) syllabus unit live.
--
-- It holds free-standing notes ONLY. A lecture note is never listed here, so
-- there is exactly one row anywhere that says "this block is a note about that
-- course", and no chance of the two disagreeing. /notes reads both sources.
--
-- Append-only: never edit this file once applied.

create table standalone_notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- The note document block. Deleting the document removes the index entry.
  block_id     uuid not null references blocks(id) on delete cascade,
  -- Nullable so a deleted course leaves the note itself intact.
  course_id    uuid references courses(id) on delete set null,
  unit_id      uuid references syllabus_units(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- One index entry per document. A second row for the same block would show the
-- note twice in the list.
create unique index standalone_notes_block_id_key on standalone_notes (block_id);
create index on standalone_notes (workspace_id, created_at desc);
create index on standalone_notes (course_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table standalone_notes enable row level security;

-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row.

create policy standalone_notes_select on standalone_notes for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy standalone_notes_insert on standalone_notes for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy standalone_notes_update on standalone_notes for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy standalone_notes_delete on standalone_notes for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
