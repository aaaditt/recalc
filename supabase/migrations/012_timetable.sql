-- 012_timetable.sql — slice 16
-- The period grid: the shape Aadit's printed timetable is actually written in.
--
-- His timetable has no clock hours down the side. It has numbered periods —
-- "1st", "2nd", "3rd" — each fifty minutes long, five minutes apart, Monday to
-- Friday. Those numbers are the row headings on the paper and they are the row
-- headings on /timetable, so they have to be data the app can read.
--
-- THIS TABLE IS NOT A SECOND TIMETABLE. `sessions` is still the weekly pattern
-- and `class_meetings` are still the dated lectures (docs/SCHEMA.md). A period
-- is only the row a session sits on: a named pair of wall-clock times, so that
-- clicking the cell at "3rd × Wednesday" knows it means 09:20–10:10.
--
-- Times are `time`, not `timestamptz`, for exactly the reason sessions.starts_at
-- is: a period is "07:30", not an instant. The timezone is applied once, when
-- meetings are generated.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- periods — the numbered rows of the printed timetable
-- ---------------------------------------------------------------------------

create table periods (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  position     int  not null,   -- 1..n, top to bottom. The order on the page.
  label        text not null,   -- what the paper calls it: '1st', '2nd', '+1'
  starts_at    time not null,   -- e.g. '07:30'
  ends_at      time not null,   -- e.g. '08:20'
  created_at   timestamptz not null default now(),
  constraint periods_time_order check (ends_at > starts_at)
);
-- One row per position per workspace: two "3rd" periods is a timetable with two
-- third periods, which is a typo rather than a schedule.
create unique index periods_workspace_position_key on periods (workspace_id, position);

-- ---------------------------------------------------------------------------
-- sessions grows two columns
-- ---------------------------------------------------------------------------

-- Which period this weekly slot occupies. Nullable, because a session typed in
-- before this slice — or one that genuinely does not sit on the grid, a two-hour
-- evening seminar — has no period, and the calendar renders it perfectly well
-- from starts_at/ends_at alone. The period is a convenience for the grid, never
-- the source of truth for the time: sessions.starts_at stays authoritative, so
-- editing a period's times later cannot silently move lectures already
-- generated.
alter table sessions add column period_id uuid references periods(id) on delete set null;

-- The image marks some cells "LAB". A lab is the same weekly slot with a
-- different feel — different room, usually double-length — so it is one boolean
-- rather than a `kind` enum nobody has a third value for.
alter table sessions add column is_lab boolean not null default false;

create index on sessions (period_id);

-- ---------------------------------------------------------------------------
-- workspaces learns when the term runs
-- ---------------------------------------------------------------------------

-- Adding a class from the grid has to generate that class's dated lectures for
-- the rest of term, and until now the term dates were typed into a form on
-- /settings/semester every single time. They are a fact about the workspace, so
-- they live on it. Both nullable: an app with no term set still renders the
-- grid, it just cannot expand a class into lectures until they are filled in.
alter table workspaces add column term_start date;
alter table workspaces add column term_end   date;

-- ---------------------------------------------------------------------------
-- Seed — the nine periods off last_sem.jpeg
-- ---------------------------------------------------------------------------

-- Fifty minutes each, five minutes between. Seeded for every workspace that
-- already exists; a workspace created after this migration gets the same nine
-- from modules/timetable's ensurePeriods, which is idempotent and is the path
-- the live (empty) database will actually take.
insert into periods (workspace_id, position, label, starts_at, ends_at)
select w.id, p.position, p.label, p.starts_at::time, p.ends_at::time
  from workspaces w
 cross join (values
   (1, '1st', '07:30', '08:20'),
   (2, '2nd', '08:25', '09:15'),
   (3, '3rd', '09:20', '10:10'),
   (4, '4th', '10:15', '11:05'),
   (5, '5th', '11:10', '12:00'),
   (6, '6th', '12:05', '12:55'),
   (7, '7th', '13:00', '13:50'),
   (8, '8th', '13:55', '14:45'),
   (9, '9th', '14:50', '15:40')
 ) as p(position, label, starts_at, ends_at)
 on conflict (workspace_id, position) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table periods enable row level security;

-- Same shape as every other policy in this project: auth.uid() wrapped in a
-- (select ...) so Postgres evaluates it once per query rather than once per row.

create policy periods_select on periods for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy periods_insert on periods for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy periods_update on periods for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy periods_delete on periods for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
