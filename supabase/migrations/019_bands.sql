-- 019_bands.sql — slice 25
--
-- A band is a named, recurring stretch of the day that runs by its own rules.
-- University is one. Evening is another.
--
-- The timetable this app was built around is 07:30–15:40, and every screen in
-- it quietly assumes those eight hours are the day. They are not: they are the
-- part of the day spent on a campus, where the priorities are different and
-- almost nothing is chosen. This table is the other sixteen hours.
--
-- THESE ARE NOT `blocks`. `blocks` is the versioned primitive everything in
-- this app is made of (docs/SCHEMA.md). A band carries no content, no version
-- and no content_hash, and nothing is ever derived from one. It is a frame.
--
-- THE UNIVERSITY BAND OWNS NO CLASSES. `sessions` is still the weekly pattern
-- and `class_meetings` are still the dated lectures. A band with
-- kind = 'university' is a lens over both — it is drawn from them and never
-- copies them, exactly as /timetable is. Deleting it deletes a frame and not
-- one lecture. modules/bands/bands.test.ts is what keeps that true.
--
-- Times are `time`, not `timestamptz`, for the same reason periods.starts_at
-- is: a band starts at "07:30", not at an instant. The timezone is applied
-- once, when a band is drawn on a date.
--
-- A BAND HAS NO COLOUR, deliberately. docs/DESIGN.md, principle 4: colour means
-- exactly one thing in this app, which is which course something belongs to,
-- and "nothing else gets to be colourful, or the signal is lost." A band is
-- chrome. The only colour inside one is the course colour of what it contains.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- bands — a stretch of the day, repeating weekly
-- ---------------------------------------------------------------------------

create table bands (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,                          -- 'University', 'Evening'
  kind         text not null default 'custom',         -- 'custom' | 'university'
  starts_at    time not null,                          -- '07:30'
  ends_at      time not null,                          -- '15:40'
  -- Which weekdays it runs, 0=Sun .. 6=Sat — `sessions.weekday`'s numbering.
  --
  -- An array rather than a row per day, which is the one place this table
  -- disagrees with `sessions`. A band is one thing that happens on several
  -- days, so moving its end time is one write; a session is a specific class
  -- on a specific day, so it is a row. Different shapes because they are
  -- different ideas, not because one of them was rushed.
  weekdays     int[] not null default '{1,2,3,4,5}',
  -- Fractional index, the convention `blocks.position` uses: insert at the
  -- midpoint, never renumber the table.
  position     numeric not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint bands_span check (ends_at > starts_at),
  constraint bands_kind check (kind in ('custom', 'university')),
  constraint bands_name_present check (length(btrim(name)) > 0),
  -- No empty week, and no 7 or -1 smuggled into the array.
  constraint bands_weekdays check (
    array_length(weekdays, 1) between 1 and 7
    and weekdays <@ '{0,1,2,3,4,5,6}'::int[]
  )
);
create index on bands (workspace_id, position);

-- One university band per workspace, enforced rather than remembered. There is
-- exactly one printed timetable and it is the same one every day of the week.
create unique index bands_one_university
  on bands (workspace_id) where kind = 'university';

-- ---------------------------------------------------------------------------
-- band_slots — what a band is for, hour by hour
-- ---------------------------------------------------------------------------

create table band_slots (
  id           uuid primary key default gen_random_uuid(),
  band_id      uuid not null references bands(id) on delete cascade,
  -- Redundant: it is reachable through band_id. It is here anyway because
  -- `sessions` made the other choice and docs/SCHEMA.md records the bill —
  -- `sessions` reaches a workspace only through `courses`, its RLS policy is
  -- three tables deep, and slices 22 and 23 both had to route around it with
  -- `security definer` functions rather than widen it. One uuid is cheaper.
  workspace_id uuid not null references workspaces(id) on delete cascade,
  label        text not null,                          -- 'Gym', 'Study', 'Dinner'
  -- Optional. A slot that names a course is drawn with that course's rail and
  -- 8% tint, the same rule every class block obeys. Nothing reads it beyond
  -- the colour yet; it is here because docs/PRODUCT.md says to choose whatever
  -- gets closer to "3 hours on Unit 1 and 20 minutes on Unit 3", and an
  -- evening that names a course is the only part of this feature that does.
  --
  -- `set null`, never cascade: deleting a course must not silently delete a
  -- recurring slot out of somebody's evening.
  course_id    uuid references courses(id) on delete set null,
  weekday      int  not null,                          -- 0=Sun .. 6=Sat
  starts_at    time not null,
  ends_at      time not null,
  created_at   timestamptz not null default now(),

  constraint band_slots_span check (ends_at > starts_at),
  constraint band_slots_weekday check (weekday between 0 and 6),
  constraint band_slots_label_present check (length(btrim(label)) > 0)
);
create index on band_slots (band_id, weekday, starts_at);
create index on band_slots (workspace_id);
create index on band_slots (course_id);

-- ---------------------------------------------------------------------------
-- Seed — the university band, from data that is already here
-- ---------------------------------------------------------------------------

-- Its span is the printed timetable's own span: the start of the first period
-- to the end of the last. Its weekdays are the days that actually have a class,
-- falling back to Monday-to-Friday for a workspace whose grid is still empty.
--
-- So the screen is correct the first time it is opened, with no setup step. A
-- workspace with no periods at all gets no band, and /bands offers to make one.
insert into bands (workspace_id, name, kind, starts_at, ends_at, weekdays, position)
select
  span.workspace_id,
  'University',
  'university',
  span.starts_at,
  span.ends_at,
  coalesce(days.weekdays, '{1,2,3,4,5}'::int[]),
  1
from (
  select workspace_id, min(starts_at) as starts_at, max(ends_at) as ends_at
    from periods
   group by workspace_id
) as span
left join (
  select c.workspace_id, array_agg(distinct s.weekday order by s.weekday) as weekdays
    from sessions s
    join courses  c on c.id = s.course_id
   group by c.workspace_id
) as days on days.workspace_id = span.workspace_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public
-- ---------------------------------------------------------------------------

-- Same shape as every other policy in this project: auth.uid() wrapped in a
-- (select ...) so Postgres evaluates it once per query rather than once per row.

alter table bands enable row level security;

create policy bands_select on bands for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy bands_insert on bands for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy bands_update on bands for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy bands_delete on bands for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

alter table band_slots enable row level security;

-- One join deep, not four, which is the whole reason workspace_id is on the row.
create policy band_slots_select on band_slots for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy band_slots_insert on band_slots for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy band_slots_update on band_slots for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy band_slots_delete on band_slots for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
