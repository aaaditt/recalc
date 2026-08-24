-- 002_semester.sql — slice 01
-- The semester layer from docs/SCHEMA.md: courses, sessions, class_meetings,
-- syllabus_units, tasks. Flat projection tables beside blocks — the small amount
-- of duplicated data is deliberate and keeps queries and UI simple.
--
-- THE DISTINCTION THAT MATTERS:
--   sessions       = the recurring WEEKLY PATTERN.
--                    "ME301 meets Tuesdays 09:00-10:30 in B204."
--   class_meetings = the ACTUAL DATED LECTURES generated from that pattern.
--                    "ME301, Tue 14 Oct 2026, 09:00, B204."
-- The calendar renders class_meetings; notes and files hang off class_meetings;
-- a cancellation email edits one class_meeting. Collapsing the two into a single
-- recurrence table breaks slices 04, 05 and 15.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------

create table courses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code         text not null,   -- subject code, e.g. 'ME301'. Shown everywhere.
  name         text not null,
  term         text not null,   -- e.g. 'Fall 2026'
  colour       text,            -- a course-colour token name (slice 02), never a hex value
  instructor   text,
  credits      numeric,
  created_at   timestamptz not null default now()
);
create index on courses (workspace_id, term);
-- Typing the timetable in by hand is the seeding path; this stops a duplicate
-- 'ME301' row from silently splitting a course in two.
create unique index courses_workspace_code_term_key
  on courses (workspace_id, code, term);

-- ---------------------------------------------------------------------------
-- sessions — the weekly pattern
-- ---------------------------------------------------------------------------

-- A class that meets twice a week at different times is simply two rows.
-- starts_at/ends_at are wall-clock times of day with no date and no timezone;
-- the timezone is supplied when meetings are generated.
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  weekday     smallint not null,   -- 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  starts_at   time not null,       -- e.g. '09:00'
  ends_at     time not null,       -- e.g. '10:30'
  room        text,
  valid_from  date,                -- null = from the start of the term
  valid_until date,                -- null = to the end of the term
  created_at  timestamptz not null default now(),
  constraint sessions_weekday_range check (weekday between 0 and 6),
  constraint sessions_time_order check (ends_at > starts_at)
);
create index on sessions (course_id, weekday);

-- ---------------------------------------------------------------------------
-- syllabus_units
-- ---------------------------------------------------------------------------

create table syllabus_units (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  position   numeric not null,    -- fractional index, same convention as blocks
  title      text not null,
  status     text not null default 'not_started',  -- not_started|shaky|comfortable|mastered
  block_id   uuid references blocks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on syllabus_units (course_id, position);

-- ---------------------------------------------------------------------------
-- class_meetings — the actual dated lectures
-- ---------------------------------------------------------------------------

create table class_meetings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  session_id    uuid references sessions(id) on delete set null,  -- null for one-offs
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  room          text,
  topic         text,                                             -- what this lecture covered
  unit_id       uuid references syllabus_units(id) on delete set null,
  status        text not null default 'scheduled',                -- scheduled|cancelled|moved|held
  note_block_id uuid references blocks(id) on delete set null,    -- the note doc for this lecture
  created_at    timestamptz not null default now(),
  constraint class_meetings_time_order check (ends_at > starts_at)
);
create index on class_meetings (workspace_id, starts_at);
create index on class_meetings (course_id, starts_at);
-- Backstop for generateMeetings: one meeting per weekly pattern per instant, so
-- a second run can never duplicate a lecture even if app-level logic slips.
create unique index class_meetings_session_starts_at_key
  on class_meetings (session_id, starts_at) where session_id is not null;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  course_id       uuid references courses(id) on delete set null,
  unit_id         uuid references syllabus_units(id) on delete set null,
  meeting_id      uuid references class_meetings(id) on delete set null,
  title           text not null,
  notes           text,
  due_at          timestamptz,
  status          text not null default 'open',   -- open|doing|done|dropped
  effort_min      int,
  source_block_id uuid references blocks(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on tasks (workspace_id, due_at);
create index on tasks (workspace_id, status);
create index on tasks (course_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table courses enable row level security;
alter table sessions enable row level security;
alter table syllabus_units enable row level security;
alter table class_meetings enable row level security;
alter table tasks enable row level security;

-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row. sessions and syllabus_units carry no workspace_id: ownership
-- flows through course_id, exactly as derivation_sources flows through derivations.

create policy courses_select on courses for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy courses_insert on courses for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy courses_update on courses for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy courses_delete on courses for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

create policy sessions_select on sessions for select to authenticated
  using (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy sessions_insert on sessions for insert to authenticated
  with check (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy sessions_update on sessions for update to authenticated
  using (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))))
  with check (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy sessions_delete on sessions for delete to authenticated
  using (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));

create policy syllabus_units_select on syllabus_units for select to authenticated
  using (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy syllabus_units_insert on syllabus_units for insert to authenticated
  with check (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy syllabus_units_update on syllabus_units for update to authenticated
  using (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))))
  with check (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));
create policy syllabus_units_delete on syllabus_units for delete to authenticated
  using (course_id in (
    select id from courses
     where workspace_id in (select id from workspaces where owner_id = (select auth.uid()))));

create policy class_meetings_select on class_meetings for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy class_meetings_insert on class_meetings for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy class_meetings_update on class_meetings for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy class_meetings_delete on class_meetings for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

create policy tasks_select on tasks for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy tasks_insert on tasks for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy tasks_update on tasks for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy tasks_delete on tasks for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
