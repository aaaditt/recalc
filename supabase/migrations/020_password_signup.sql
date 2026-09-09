-- 020_password_signup.sql — a way in that needs no email
--
-- Signing in was three doors, and two of them left the building. `signInWithOtp`
-- and `signInWithOAuth` both hand the browser to Supabase, which sends it back
-- to whatever is in the project's redirect allow-list and falls back to Site
-- URL when nothing matches. Site URL was `http://localhost:3000`, so the first
-- person who was not Aadit followed a link to a machine that was not running.
--
-- The third door, a password, never redirects anywhere and was never broken —
-- but `app/login/page.tsx` refused to create accounts with it ("This page never
-- creates an account"), so a new person could not use the one door that worked.
--
-- Slice 27 opens it. Accounts are made server-side with the service role and
-- `email_confirm: true`, which sends no mail and performs no redirect, so the
-- allow-list stops being load-bearing for getting in at all.
--
-- This file adds the one thing that needs SQL: signing in with a username.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- email_for_username — the username -> email hop, service role only
-- ---------------------------------------------------------------------------
--
-- `signInWithPassword` takes an email and there is no username variant, so
-- "aadit + password" has to become "aaditchandra2212@gmail.com + password"
-- somewhere. That somewhere is here, and it runs on the server: the address is
-- read inside a server action and handed straight to Supabase. It is never sent
-- to the browser, never put in a URL, and never returned to a client component.
--
-- THIS FUNCTION RETURNS AN EMAIL ADDRESS. That is the whole reason for the two
-- lines at the bottom of this file. `find_profile_by_username` in migration 013
-- is granted to `authenticated` because it hands back a username and a display
-- name — things a person already chose to be found by. An email address is not
-- that, so this one is granted to `service_role` and to nothing else. A signed-in
-- user calling it through PostgREST gets a permission error, which is correct:
-- the only caller that should ever exist is a server action holding the
-- service-role key.
--
-- `security definer` because `auth.users` is not readable by any application
-- role, and `search_path = ''` so every name below resolves literally and
-- nothing can be shadowed by a schema on someone else's path.
--
-- Same known limit as migration 013, and no worse: someone who can already call
-- this can confirm a username they suspect. Nobody outside the server can call
-- it at all.
create or replace function email_for_username(p_username text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.username) = lower(trim(p_username))
   limit 1;
$$;

-- `security definer` functions are executable by PUBLIC unless told otherwise,
-- and PUBLIC includes `anon` — the key that ships to the browser. Without the
-- revoke, a signed-out visitor could turn any username into an email address.
revoke all on function email_for_username(text) from public;
revoke all on function email_for_username(text) from anon;
revoke all on function email_for_username(text) from authenticated;
grant execute on function email_for_username(text) to service_role;
