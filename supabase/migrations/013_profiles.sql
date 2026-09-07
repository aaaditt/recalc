-- 013_profiles.sql — slice 18
-- Identity: a username, so one person can be named to another.
--
-- Everything before this slice needed no name. A workspace belonged to an
-- auth.users row and nothing ever had to say who that was. A friends list
-- cannot work that way — "add @aadit" needs an @aadit — so this is the first
-- table in the project about a *person* rather than about their semester.
--
-- Append-only: never edit this file once applied.


-- ===========================================================================
-- PART 1 — Evict another application's tables from this database
-- ===========================================================================
--
-- Read this before assuming it is a mistake.
--
-- On 28-29 August, eighteen tables belonging to a trip-planning app were
-- created in this project. They are not in this project's migration ledger
-- (supabase_migrations.schema_migrations lists 001-012 and nothing else),
-- because no migration here ever created them: that app was pointed at this
-- project's URL and keys for a while. It has since been corrected and now
-- points at its own project, where this data also lives.
--
-- Two of them were not merely clutter:
--
--   * `public.profiles` occupied the name this slice needs.
--   * `on_auth_user_created` on **auth.users** called handle_new_auth_user(),
--     which inserted a row into that profiles table for EVERY sign-up in this
--     project — Recalc's included. Signing in here wrote a trip-app profile.
--     Left in place it would have fought this migration's own profiles table
--     on every new account.
--
-- The 94 rows were backed up before this ran, and the owning project holds
-- them. See docs/DECISIONS.md, "The trip app in the Recalc database".

-- The trigger first: it writes into a table dropped below, and it fires on a
-- table this project does not own.
--
-- It is removed by dropping its *function* with `cascade`, not by
-- `drop trigger ... on auth.users`, and the difference is not stylistic.
-- Postgres requires ownership of the table to drop a trigger on it, and
-- `auth.users` is owned by `supabase_auth_admin`; migrations run as `postgres`,
-- which has the TRIGGER privilege (enough to have created this thing) but not
-- ownership (not enough to drop it). `handle_new_auth_user()` however lives in
-- `public` and *is* owned by `postgres`, and dropping a function takes the
-- triggers that call it with it. Same outcome, through a door we have a key to.
drop function if exists public.handle_new_auth_user() cascade;

-- The tables. `cascade` because they reference each other; nothing in Recalc
-- references any of them, so nothing of ours travels with the cascade.
-- Every name is schema-qualified: `public.users` is the trip app's table and
-- has nothing to do with `auth.users`, which stays exactly where it is.
drop table if exists public.comment_reports  cascade;
drop table if exists public.blocked_members  cascade;
drop table if exists public.comments         cascade;
drop table if exists public.ratings          cascade;
drop table if exists public.votes            cascade;
drop table if exists public.place_notes      cascade;
drop table if exists public.trip_notes       cascade;
drop table if exists public.itinerary_items  cascade;
drop table if exists public.calendar_access  cascade;
drop table if exists public.experiences      cascade;
drop table if exists public.catalog_places   cascade;
drop table if exists public.catalog_regions  cascade;
drop table if exists public.regions          cascade;
drop table if exists public.trip_invites     cascade;
drop table if exists public.trip_members     cascade;
drop table if exists public.trips            cascade;
drop table if exists public.profiles         cascade;
drop table if exists public.users            cascade;

-- The functions. Listed one per line with full signatures rather than swept up
-- by a DO block, so that what this migration destroys can be read off the page.
-- handle_new_auth_user() is already gone — dropped with `cascade` at the top of
-- this migration, because that is what removed its trigger on auth.users.
drop function if exists public.handle_new_trip() cascade;
drop function if exists public.create_trip(text, text, date, date);
drop function if exists public.create_georgia_trip(text, date, date, text[]);
drop function if exists public.seed_trip_catalog(uuid, text[]);
drop function if exists public.add_region(text, uuid, text, text, text, integer);
drop function if exists public.set_trip_region_selected(text, boolean);
drop function if exists public.add_experience(text, uuid, text, text, text, text, text);
drop function if exists public.add_itinerary_item(text, uuid, text, text, text, text, text, date, integer, integer, uuid);
drop function if exists public.update_itinerary_item(text, date, integer, integer, text, text);
drop function if exists public.delete_itinerary_item(text);
drop function if exists public.add_comment(uuid, uuid, text, text);
drop function if exists public.delete_comment(integer);
drop function if exists public.report_comment(uuid, integer, uuid, text);
drop function if exists public.dismiss_report(uuid);
drop function if exists public.upsert_vote(uuid, uuid, text, text);
drop function if exists public.upsert_rating(uuid, uuid, text, integer);
drop function if exists public.upsert_place_note(uuid, uuid, text, text);
drop function if exists public.upsert_trip_note(uuid, uuid, text);
drop function if exists public.grant_calendar_access(uuid, uuid);
drop function if exists public.revoke_calendar_access(uuid, uuid);
drop function if exists public.block_member(uuid, uuid, uuid);
drop function if exists public.unblock_member(uuid, uuid);
drop function if exists public.remove_trip_member(uuid);
drop function if exists public.update_member_role(uuid, text);
drop function if exists public.redeem_trip_invite(text);
drop function if exists public.update_own_profile(text);
drop function if exists public.delete_own_account();


-- ===========================================================================
-- PART 2 — profiles
-- ===========================================================================

create table profiles (
  -- The auth.users id itself, not a fresh uuid. A profile is not a thing a
  -- user *has* — it is the user, named. One row per account, enforced by the
  -- primary key rather than by a unique index someone could forget.
  id           uuid primary key references auth.users(id) on delete cascade,

  -- Stored lowercase. The check constraint is the last line of defence; the
  -- readable rules and the reserved-word list live in modules/profiles/schema.ts,
  -- because "that word is a route" is a fact about the app, not about the data.
  username     text not null,

  -- What a friend actually sees. Optional: a username is enough to be findable,
  -- and forcing a second field on the welcome screen would make it a form.
  display_name text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

-- Case-insensitive uniqueness. `citext` would be tidier but it is an extension,
-- and a functional unique index costs nothing and needs no extension enabled.
-- This index is also what `claimUsername` catches as 23505 to say "taken".
create unique index profiles_username_key on profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

-- You can read your own row. Nothing else.
--
-- This is deliberately tighter than it needs to feel. A policy permissive
-- enough to find @aadit by name is permissive enough to list every account on
-- the app, and that is a privacy leak that cannot be taken back once other
-- people have signed up. Slice 19 widens this to accepted friends and no
-- further; slice 20 does not widen it at all.
--
-- The same (select auth.uid()) wrapping as every other policy in this project:
-- evaluated once per query rather than once per row.
create policy profiles_select on profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- No delete policy on purpose. A profile dies with its auth.users row through
-- the cascade above; there is no such thing as deleting your name but keeping
-- your account, and a policy allowing it would be a way to orphan a friendship.

-- ---------------------------------------------------------------------------
-- Looking someone up — the one door through the policy above
-- ---------------------------------------------------------------------------

-- Exact match, at most one row, never yourself.
--
-- `security definer` means this runs with the function owner's rights and so
-- sees past profiles_select. That is the entire point, and it is why the body
-- is four lines long: everything this function can be made to do should fit on
-- one screen. It cannot be coaxed into a prefix search, a list, or a count.
--
-- `search_path = ''` so every name below is resolved literally and nothing can
-- be shadowed by a schema on someone else's path.
--
-- Known limit, recorded in docs/DECISIONS.md: someone can still confirm a
-- username they already suspect by trying it. Prefix enumeration is impossible;
-- exact-string guessing is not. This is the same trade Signal and Venmo make,
-- and rate limiting is a later slice's problem.
create or replace function find_profile_by_username(p_username text)
returns table (id uuid, username text, display_name text)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.username, p.display_name
    from public.profiles p
   where lower(p.username) = lower(trim(p_username))
     and p.id <> (select auth.uid())
   limit 1;
$$;

-- `security definer` functions are executable by PUBLIC unless told otherwise,
-- and PUBLIC includes the anon role — which is the key in the browser. Without
-- these two lines a signed-out visitor could probe usernames.
revoke all on function find_profile_by_username(text) from public;
grant execute on function find_profile_by_username(text) to authenticated;
