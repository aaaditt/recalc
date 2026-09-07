-- 014_speed.sql — slice 19
-- The username gate, moved off the wire and into the token.
--
-- Slice 18 put a check in the proxy: does this account have a profile yet, and
-- if not, send it to /welcome. Correct, and expensive in a way that is invisible
-- in the code — it is one primary-key lookup, but it runs on EVERY signed-in
-- request, sequentially after `getUser()`, against a database in ap-southeast-2
-- measured at ~606ms a round trip. Two trips before any page begins to render.
--
-- The lookup answers a boolean that changes exactly once in an account's life.
-- So it belongs in the JWT, where `getUser()` returns it for nothing: that call
-- is already being made, and `auth.users.raw_app_meta_data` comes back with it.
--
-- Why a trigger rather than a line in `claimUsername`:
--
--   * `app_metadata` is written with the service-role key, and
--     `lib/supabase/admin.ts` imports `server-only`, which throws under Vitest.
--     Importing it into modules/profiles would break username.test.ts.
--   * A flag maintained by hand next to an insert is a flag that drifts. This
--     one cannot: it is derived from the row, by the same statement that makes
--     the row.
--
-- `app_metadata` and not `user_metadata`, and the difference matters: a signed-in
-- client can write its own `user_metadata` through the API. If this flag lived
-- there, anybody could set it to true and walk past the gate. `app_metadata` is
-- writable only by the service role and by SQL.
--
-- Append-only: never edit this file once applied.


-- ===========================================================================
-- The flag
-- ===========================================================================
--
-- `security definer` because it writes `auth.users`, which is owned by
-- `supabase_auth_admin`. Migrations run as `postgres`, which does not own that
-- table but does hold UPDATE on it — checked with has_table_privilege before
-- this was written, because slice 18 learned the hard way that ownership and
-- privilege are different questions on this table.
--
-- `search_path` is pinned. A `security definer` function without one runs
-- whatever the caller's search_path resolves `jsonb` and `users` to, which is a
-- privilege-escalation hole rather than a style preference.
create or replace function public.mark_profile_claimed()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('has_profile', true)
  where id = new.id;
  return new;
end;
$$;

comment on function public.mark_profile_claimed() is
  'Slice 19. Mirrors "this account has a username" into the JWT so the proxy '
  'does not spend a round trip asking the database on every request.';

-- After, not before: the flag says the row exists, so the row should exist
-- before it says so. Nothing downstream reads it inside this transaction.
drop trigger if exists profiles_mark_claimed on public.profiles;
create trigger profiles_mark_claimed
  after insert on public.profiles
  for each row execute function public.mark_profile_claimed();


-- ===========================================================================
-- Backfill
-- ===========================================================================
--
-- Every account that claimed a username before this migration existed. Without
-- it the proxy's fallback path fires for them for ever, which is correct but is
-- exactly the 600ms this slice is removing.
update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('has_profile', true)
from public.profiles p
where p.id = u.id;
