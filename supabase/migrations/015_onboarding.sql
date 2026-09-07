-- 015_onboarding.sql — slice 20
-- A guided path that teaches by doing, and the one fact it cannot derive.
--
-- Numbered 015 rather than 014: the onboarding design was written when 014 was
-- free, and slice 19 took it. The design document still says 014; this is the
-- file that ran.
--
-- Two columns. One replaces a cookie with a fact about a person; the other is
-- the difference between the guided path teaching this product's whole point and
-- silently skipping it.
--
-- Append-only: never edit this file once applied.


-- ===========================================================================
-- PART 1 — "I am done with the setup path" is a fact about a person
-- ===========================================================================
--
-- It was a cookie (`lib/first-run.ts`, FIRST_RUN_COOKIE), which had a bug nobody
-- had hit yet: dismissing the setup card on a laptop left it showing on the
-- phone. A browser's patience is not the same thing as a person's.
--
-- Nullable rather than a boolean default false, because the timestamp is worth
-- more than the flag: "when did they decide they were done with this" is a
-- question worth being able to answer, and `is not null` is the flag.
--
-- This is possible now and was not before slice 18, because before slice 18
-- there was no row per account to hang it on.
alter table profiles add column onboarding_dismissed_at timestamptz;

comment on column profiles.onboarding_dismissed_at is
  'Slice 20. When this account dismissed the guided setup path. Replaces the '
  'FIRST_RUN_COOKIE, which was per-browser and so said the wrong thing on a '
  'second device.';


-- ===========================================================================
-- PART 2 — How many times has this derivation gone stale?
-- ===========================================================================
--
-- Read this before assuming it is scope creep. It is the slice's invariant.
--
-- The last step of the guided path is "edit the note, and watch the summary go
-- stale" — the one behaviour this entire product exists for. The step has to
-- know when it has happened, and the honest predicates all fail:
--
--   * `status = 'stale'` un-ticks the moment the user accepts the diff in
--     /review, which is the correct action and the thing the step was teaching.
--     The design document names this trap.
--
--   * `blocks.version > 1` on a source block, which the design chose instead,
--     is true BEFORE anything is summarised. The editor autosaves a second after
--     the last keystroke and `updateBlock` bumps the version whenever the content
--     hash moves, so a note written in two sittings is already at version 2.
--     Measured, not guessed: a paragraph typed, paused over, and continued comes
--     out at version 2 with no summary in existence. The step would tick itself
--     alongside step 6 and the lesson would never be seen.
--
--   * `derivation_sources.source_version` vs the block's current version is
--     exactly right at the moment of the edit, and is then reset by
--     `replaceSources` inside both `acceptPreview` and `keepOldVersion`. The
--     first trap again, wearing a different hat.
--
-- None of those is a fact that survives. This column is: it counts fresh->stale
-- transitions, it only ever increases, and nothing in /review touches it. The
-- predicate becomes "a summarize derivation in this workspace has gone stale at
-- least once", which is what the step actually means.
--
-- It is a fact about a derivation rather than about onboarding, which is why it
-- lives here and not in a progress table. "Progress is derived, never stored"
-- still holds: nothing records that step 7 is done.
alter table derivations add column stale_runs int not null default 0;

comment on column derivations.stale_runs is
  'How many times this derivation has gone fresh->stale. Monotonic, and never '
  'reset by accepting or discarding in /review. Slice 20.';

-- Anything sitting stale right now has been stale at least once. Without this
-- an existing stale summary would report zero for ever, because the transition
-- that made it stale happened before this column existed.
update derivations set stale_runs = 1 where status = 'stale';


-- ===========================================================================
-- PART 3 — The cascade, replaced with one line added
-- ===========================================================================
--
-- THIS TRIGGER IS THE PRODUCT (migration 001's own words), so read the diff
-- rather than the file: the only change is `stale_runs = d.stale_runs + 1` in
-- the same SET. The `where d.status = 'fresh'` guard is untouched, which is what
-- makes the count a count of *transitions* rather than of update statements —
-- a derivation already stale is not matched and is not incremented twice.
--
-- Everything else is character-for-character migration 001, including the pinned
-- empty `search_path` and the schema-qualified table names, both of which are
-- there so the function cannot be hijacked by objects in another schema.
--
-- `modules/recalc/staleness.test.ts` must still pass untouched after this. If it
-- does not, revert this part and nothing else: the counter is worth less than
-- the cascade by an enormous margin.
create or replace function mark_derivations_stale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.derivations d
     set status     = 'stale',
         stale_runs = d.stale_runs + 1
   where d.status = 'fresh'
     and exists (
       select 1 from public.derivation_sources s
        where s.derivation_id  = d.id
          and s.source_block_id = NEW.id
          and s.source_version  < NEW.version
     );
  return NEW;
end $$;
