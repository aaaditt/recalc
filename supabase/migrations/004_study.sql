-- 004_study.sql — slice 07
--
-- `study_sessions` from docs/SCHEMA.md's semester layer. It was listed there
-- from the start but not built in slice 01, because it was not in that slice's
-- build list (docs/DECISIONS.md, "Noticed, not fixed"). Focus needs it.
--
-- This table is the second half of the sentence docs/PRODUCT.md says the whole
-- product is for:
--
--   "6 questions on Unit 3 you never resolved, zero on Unit 1. You've spent
--    3 hours on Unit 1 and 20 minutes on Unit 3."
--
-- The questions arrive in slice 12. The minutes are these rows.
--
-- Append-only: never edit this file once applied.

create table study_sessions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Required: "what are you working on?" is answered before the timer starts,
  -- so every logged minute belongs to a course. Cascade rather than set null,
  -- the same as class_meetings — minutes against a course that no longer
  -- exists are minutes nothing can ever ask about again.
  course_id    uuid not null references courses(id) on delete cascade,
  -- Optional, and the reason this table exists. Set null on delete so removing
  -- a syllabus unit keeps the course total honest instead of erasing the row.
  unit_id      uuid references syllabus_units(id) on delete set null,
  -- Instants. A row is written only once the block is finished, so ended_at is
  -- never null: every row here is a session that actually happened, and every
  -- "how many minutes" query is a plain sum with no open sessions to exclude.
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  -- 1 scattered · 2 ok · 3 deep. Null means the question was skipped, which is
  -- one tap and the common case.
  focus_rating smallint,
  created_at   timestamptz not null default now(),
  constraint study_sessions_time_order check (ended_at > started_at),
  constraint study_sessions_focus_range
    check (focus_rating is null or focus_rating between 1 and 3)
);

create index on study_sessions (workspace_id, started_at);
create index on study_sessions (course_id, started_at);
create index on study_sessions (unit_id, started_at);

-- The timer lives in the browser and writes its row when the block finishes.
-- A second tab, a double tap or a retried request must not turn one 25-minute
-- block into 50 logged minutes, so a workspace can hold exactly one session
-- per start instant. modules/study returns the existing row instead of
-- inserting; this is the database-level backstop behind that.
create unique index study_sessions_workspace_started_at_key
  on study_sessions (workspace_id, started_at);

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table study_sessions enable row level security;

-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row.

create policy study_sessions_select on study_sessions for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy study_sessions_insert on study_sessions for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy study_sessions_update on study_sessions for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy study_sessions_delete on study_sessions for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
