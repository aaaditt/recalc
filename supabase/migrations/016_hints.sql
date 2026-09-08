-- 016_hints.sql — slice 21
-- Each feature explains itself the first time it becomes useful.
--
-- One column, and it replaces the one slice 20 added a day ago.
--
-- Slice 20 put `onboarding_dismissed_at` on `profiles` for a single flag: "I am
-- done with the guided setup path." This slice needs the same idea five more
-- times — "I have seen the thing about /review", "…about search" — and two
-- unrelated mechanisms for "I have seen this" is one more than the idea
-- deserves. So there is one map, and the setup path becomes an entry in it.
--
-- `jsonb` and not `text[]` because the value is worth keeping. An array of ids
-- answers "have they seen it"; a map of id -> timestamp also answers "when", and
-- "when did they dismiss this" is the question you want the day a hint turns out
-- to be firing at the wrong moment.
--
-- Append-only: never edit this file once applied. Dropping a column that
-- migration 015 added is not editing migration 015 — 015 still ran, and still
-- says what it did.


-- ===========================================================================
-- The map
-- ===========================================================================
--
-- Keys are notice ids, owned by the module that shows the notice:
--
--   'setup'      modules/onboarding — the guided path at /start
--   'review'     modules/hints      — what /review is, the first time
--                                     something goes stale
--   'search'     modules/hints      — search reads inside notes
--   'questions'  modules/hints      — select a sentence and ask about it
--   'focus'      modules/hints      — a focus session logs against a unit
--   'tasks'      modules/hints      — the deadline shorthand
--
-- `not null default '{}'` so no reader ever has to think about null. An account
-- that has dismissed nothing has an empty map, which is the truth.
alter table profiles
  add column dismissed_notices jsonb not null default '{}'::jsonb;

comment on column profiles.dismissed_notices is
  'Notice id -> ISO timestamp it was dismissed. One mechanism for "I have seen '
  'this": the guided setup path is the id `setup`, and slice 21''s just-in-time '
  'hints are the rest. Slice 21.';


-- ===========================================================================
-- The setup path moves in, and its own column goes
-- ===========================================================================
--
-- Backfill before drop, and in that order, or the one account that had dismissed
-- the setup path would get it back — which is a small thing to get wrong and an
-- annoying one to be on the receiving end of.
update profiles
   set dismissed_notices =
     dismissed_notices || jsonb_build_object(
       'setup',
       to_char(onboarding_dismissed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     )
 where onboarding_dismissed_at is not null;

alter table profiles drop column onboarding_dismissed_at;
