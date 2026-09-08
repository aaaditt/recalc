-- 017_friends.sql — slice 22
-- Friends: one row per pair, and two independent decisions about what to show.
--
-- This is the first table in the project that lets one person see another
-- person's data. Everything before it was scoped to a workspace owned by one
-- `auth.users` row, and the whole of RLS was "is this yours". So this file is
-- mostly policies, one trigger, and one `security definer` function, and the
-- table itself is the short part.
--
-- Append-only: never edit this file once applied.


-- ===========================================================================
-- The table
-- ===========================================================================
--
-- One row per pair, not one per direction. Two rows would mean two things that
-- could disagree about whether you are friends, and there is no answer to
-- "she accepted but his row still says pending" that is not a repair job.
--
-- What is directional is what each of you *shows*, and those are two columns on
-- the one row. They are genuinely independent choices: showing someone your
-- timetable is not a request to see theirs, and an app that pretends otherwise
-- is an app that makes people share more than they meant to.
create table friendships (
  id            uuid primary key default gen_random_uuid(),

  -- Who asked, and who was asked. These never change — see the guard trigger.
  -- `profiles`, not `auth.users`: you cannot be asked to be friends with an
  -- account that has not chosen a username, because there would be nothing to
  -- type in order to ask.
  requester_id  uuid not null references profiles(id) on delete cascade,
  addressee_id  uuid not null references profiles(id) on delete cascade,

  -- `pending` or `accepted`, and nothing else.
  --
  -- There is deliberately no `declined`. A declined request is deleted, because
  -- a stored refusal is a record of a small social rejection that the app would
  -- then have to decide when to show, when to expire and whether to let the
  -- other person see. Deleting it means the requester's screen simply stops
  -- saying "pending" — and means they can ask again, which is what a person
  -- would do anyway. Blocking is not in this slice and is not this column.
  status        text not null default 'pending',

  -- The two decisions. What *I* let *you* see, on my row.
  --
  --   none   you see nothing of my timetable
  --   busy   you see when I am in a class, and nothing about which class
  --   full   you also see the course code and the room
  --
  -- `busy` is the default on both sides because accepting a friend request is
  -- itself the consent, and a default of `none` would make accepting one do
  -- nothing at all — which teaches people that the accept button is broken.
  -- Slice 23 is what reads these, through a second function, and it must read
  -- the one for the correct direction.
  requester_shares text not null default 'busy',
  addressee_shares text not null default 'busy',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint friendships_not_self  check (requester_id <> addressee_id),
  constraint friendships_status    check (status in ('pending', 'accepted')),
  constraint friendships_requester_shares check (requester_shares in ('none','busy','full')),
  constraint friendships_addressee_shares check (addressee_shares in ('none','busy','full'))
);

-- One pair, once, whichever way round it was asked.
--
-- `least`/`greatest` on the two uuids gives the pair an order that does not
-- depend on who asked, so (a,b) and (b,a) collide on the index. Without this,
-- two people who happen to add each other on the same evening end up with two
-- friendships and a screen that lists each of them twice.
create unique index friendships_pair_key
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- Both directions get an index, because every question here is asked from one
-- side or the other: "who has asked me" and "who have I asked".
create index friendships_requester_idx on friendships (requester_id, status);
create index friendships_addressee_idx on friendships (addressee_id, status);


-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table friendships enable row level security;

-- You can see a friendship you are in. Both parties can, at every status —
-- the requester has to be able to see that it is still pending, and the
-- addressee has to be able to see that it exists at all.
create policy friendships_select on friendships for select to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

-- You can only ask on your own behalf, and only ever as a pending request.
-- Without the status check, one insert would make you somebody's friend.
create policy friendships_insert on friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
  );

-- Either side may update, and what each side may actually change is settled by
-- the trigger below rather than here. A policy is row-level: it can say "this
-- row is yours to touch" and cannot say "but only that column", and the whole
-- point of this table is that one of these columns is yours and one is theirs.
create policy friendships_update on friendships for update to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  )
  with check (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

-- Either side may delete, and this one door is three things at once: the
-- requester cancelling, the addressee declining, and either of them unfriending
-- later. They are the same act — "there is no friendship here" — and giving
-- them one mechanism means there is one thing to get right.
create policy friendships_delete on friendships for delete to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );


-- ===========================================================================
-- The guard — what a policy cannot say
-- ===========================================================================
--
-- Postgres policies are row-level. `friendships_update` can say "this row is
-- yours to touch"; it cannot say "and you may change this column but not that
-- one". Everything that needs saying about *columns* is here.
--
-- Four rules, and each of them is a way the anon key in the browser could
-- otherwise be used to lie:
--
--   1. The two people never change. Otherwise an accepted friendship could be
--      re-pointed at somebody who never agreed to anything.
--   2. Only the person who was asked can accept. Otherwise the requester
--      accepts their own request.
--   3. Status only ever goes pending -> accepted. There is no un-accepting; you
--      delete the row, which both sides may do.
--   4. Each side may only change their own `*_shares` column. This is the
--      privacy boundary of the whole slice: without it, one press could make
--      somebody else share their timetable in full.
--
-- Not `security definer`: this checks the caller's identity, so it wants the
-- caller's rights. `auth.uid()` is null for the service role, and every `<>`
-- against null is null rather than true, so these rules do not fire for it —
-- which is correct (service role bypasses RLS by design) and is exactly why
-- `modules/friends/friendships.test.ts` proves them with two real signed-in
-- sessions on the anon key instead.
create or replace function friendships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'friendships: the two people in a friendship cannot be changed';
  end if;

  if new.status <> old.status then
    if old.status <> 'pending' then
      raise exception 'friendships: only a pending request can change status';
    end if;
    if new.status <> 'accepted' then
      raise exception 'friendships: a request is accepted, or it is deleted';
    end if;
    if me <> old.addressee_id then
      raise exception 'friendships: only the person who was asked can accept';
    end if;
  end if;

  if new.requester_shares <> old.requester_shares and me <> old.requester_id then
    raise exception 'friendships: you can only change what you share';
  end if;
  if new.addressee_shares <> old.addressee_shares and me <> old.addressee_id then
    raise exception 'friendships: you can only change what you share';
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger friendships_guard_update
  before update on friendships
  for each row execute function friendships_guard();


-- ===========================================================================
-- Reading the other person — and why `profiles_select` was NOT widened
-- ===========================================================================
--
-- Migration 013 and docs/SCHEMA.md both say this slice widens `profiles_select`
-- to accepted friends. It does not, and the reason arrived after those were
-- written: slice 21 added `profiles.dismissed_notices`, and a policy is
-- row-level, so widening `select` on `profiles` hands a friend the whole row —
-- every column on it today and every column added to it later. Which tips a
-- person has dismissed is nobody else's business, and "we will remember to
-- think about this every time we add a column to profiles" is not a boundary.
--
-- So the door is the same shape as `find_profile_by_username`: one function,
-- naming exactly the three fields another person is allowed to see, and
-- returning them only for people you are actually in a friendship with.
--
-- It returns pending rows too, both incoming and outgoing, because the screen
-- has to name the person who asked you — and it says which direction each one
-- is so the screen never has to guess from the ids.
create or replace function my_friendships()
returns table (
  id                 uuid,
  other_id           uuid,
  other_username     text,
  other_display_name text,
  status             text,
  -- 'incoming' = they asked me. 'outgoing' = I asked them.
  direction          text,
  -- Named from the caller's point of view, so a screen cannot read the wrong
  -- column. `i_share` is what I show them; `they_share` is what they show me.
  i_share            text,
  they_share         text,
  created_at         timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    f.id,
    p.id,
    p.username,
    p.display_name,
    f.status,
    case when f.addressee_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
    case when f.requester_id = (select auth.uid()) then f.requester_shares else f.addressee_shares end,
    case when f.requester_id = (select auth.uid()) then f.addressee_shares else f.requester_shares end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case
                when f.requester_id = (select auth.uid()) then f.addressee_id
                else f.requester_id
              end
  where f.requester_id = (select auth.uid())
     or f.addressee_id = (select auth.uid())
  order by f.created_at desc;
$$;

-- `security definer` functions are executable by PUBLIC unless told otherwise,
-- and PUBLIC includes the anon role — which is the key in the browser.
revoke all on function my_friendships() from public;
grant execute on function my_friendships() to authenticated;
