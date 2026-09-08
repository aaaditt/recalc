-- 018_compare.sql — slice 23
-- One friend's week, beside yours.
--
-- The payoff for slice 22, and the slice with the sharpest failure mode in the
-- project: it returns another person's timetable, and the only thing standing
-- between "the hour you are both free" and "here is everything about somebody
-- who did not agree to that" is the function below.
--
-- Append-only: never edit this file once applied.


-- ===========================================================================
-- Why this is a function and NOT a policy on `sessions`
-- ===========================================================================
--
-- The obvious move is to widen `sessions_select` so a friend's rows come back
-- from an ordinary query. Do not.
--
-- `sessions` has no `workspace_id`. It reaches a workspace only through
-- `courses`, so the existing policy is already two joins deep:
--
--     sessions -> courses -> workspaces -> owner_id = auth.uid()
--
-- Widening it to friends makes that four tables and a direction-dependent
-- column read, expressed as a `using` clause that runs on every row of every
-- query anyone ever writes against `sessions` — including the ones that have
-- nothing to do with friends. A mistake in a policy that shape does not fail
-- loudly; it returns rows, and the rows are somebody else's.
--
-- So the policy is left exactly as it is, and this is one function with one
-- purpose whose entire body fits on a screen. It is the same choice migration
-- 013 made for `find_profile_by_username`, for the same reason: everything a
-- `security definer` function can be made to do should be readable at a glance.


-- ===========================================================================
-- The function
-- ===========================================================================
--
-- Three things it must get right, in order of how badly they fail:
--
--   1. **The direction.** `friendships` holds two independent decisions on one
--      row. What I am allowed to see is what THEY share, which is
--      `requester_shares` when they are the requester and `addressee_shares`
--      when they are not. Reading the wrong one shows me their week on the
--      strength of a choice I made about my own.
--
--   2. **Accepted only.** A pending request is not consent. `status =
--      'accepted'` is in the where clause, not assumed by the caller.
--
--   3. **`none` returns nothing, and `busy` returns nulls rather than omitting
--      columns.** The shape of the result is the same at every level, so a
--      caller cannot tell levels apart by which columns came back, and cannot
--      accidentally read a code that "happened to be there".
--
-- `stable` and not `volatile`: it writes nothing, and it lets Postgres call it
-- once per query rather than once per row.
create or replace function friend_timetable(p_friend_id uuid)
returns table (
  weekday     smallint,
  starts_at   time,
  ends_at     time,
  -- Null unless they share `full`. Never omitted — see (3) above.
  course_code text,
  room        text
)
language sql
security definer
set search_path = ''
stable
as $$
  with allowed as (
    select case
             when f.requester_id = (select auth.uid()) then f.addressee_shares
             else f.requester_shares
           end as share
      from public.friendships f
     where f.status = 'accepted'
       and (
            (f.requester_id = (select auth.uid()) and f.addressee_id = p_friend_id)
         or (f.addressee_id = (select auth.uid()) and f.requester_id = p_friend_id)
       )
     limit 1
  ),
  -- One workspace per account (`ensureWorkspace`), but picked deterministically
  -- rather than trusted to be alone: a join on `owner_id` would return each
  -- class twice the day that stops being true.
  theirs as (
    select w.id
      from public.workspaces w
     where w.owner_id = p_friend_id
     order by w.created_at, w.id
     limit 1
  )
  select
    s.weekday,
    s.starts_at,
    s.ends_at,
    case when a.share = 'full' then c.code else null end,
    case when a.share = 'full' then s.room else null end
  from allowed a
  cross join theirs t
  join public.courses  c on c.workspace_id = t.id
  join public.sessions s on s.course_id = c.id
  where a.share in ('busy', 'full')
  order by s.weekday, s.starts_at;
$$;

-- `security definer` functions are executable by PUBLIC unless told otherwise,
-- and PUBLIC includes the anon role — which is the key in the browser. Without
-- these two lines a signed-out visitor could read anybody's timetable by id.
revoke all on function friend_timetable(uuid) from public;
grant execute on function friend_timetable(uuid) to authenticated;
