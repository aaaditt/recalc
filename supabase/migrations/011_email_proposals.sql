-- 011_email_proposals.sql — slice 15
--
-- One table. docs/SCHEMA.md names it:
--
--   email_proposals (id, email_id, kind, payload jsonb, confidence, status)
--                   -- status: proposed | accepted | rejected  <- human in the loop, always
--
-- Everything below that line is here because the constraint the slice exists to
-- keep could not be kept without it:
--
--   * `fingerprint` — "never propose the same thing twice from the same email"
--     has to be enforced in the DATABASE, not in service code, and a unique
--     index needs a column to point at. The fingerprint is a normalised
--     identity for the thing being proposed ("deadline|lab report 3|2026-03-04"),
--     computed in modules/proposals/schema.ts. A REJECTED row keeps its
--     fingerprint, so it goes on blocking a re-proposal for ever. That is the
--     whole point: rejecting is not deleting.
--   * `course_id` — the slice has to *show which course it thinks this is*, and
--     a foreign key is how that stays true when a course is deleted.
--   * `task_id` / `meeting_id` — what accepting actually did, and (for a class
--     change) which lecture it is about. Provenance in both directions.
--   * `decided_at` — when the human tapped.
--
-- The thing this table must never do is put a row in `tasks`. Nothing in this
-- migration writes anywhere else, and nothing in the app creates a task from an
-- email except `acceptProposal`, which is only ever reached from a button.
--
-- Append-only: never edit this file once applied.

create table email_proposals (
  id           uuid primary key default gen_random_uuid(),
  -- The message it was read out of. Deleting the mail deletes the proposals
  -- made from it — a proposal whose evidence is gone cannot be judged.
  email_id     uuid not null references email_messages(id) on delete cascade,
  -- deadline     — something is due
  -- class_change — a lecture is cancelled, moved, or rescheduled
  -- material     — a reading, a slide deck, a problem sheet worth looking at
  kind         text not null check (kind in ('deadline', 'class_change', 'material')),
  -- What was found, and — always — `sourceText`: the exact words from the
  -- subject or snippet it was read out of, so it can be judged in one glance.
  payload      jsonb not null default '{}'::jsonb,
  -- What the cheap gate scored this email at, 0..1. It is a heuristic score and
  -- nothing more; no screen renders it as a percentage, because a made-up
  -- precision is worse than no number at all.
  confidence   real not null default 0 check (confidence >= 0 and confidence <= 1),
  status       text not null default 'proposed'
               check (status in ('proposed', 'accepted', 'rejected')),

  -- The identity of the thing proposed. See the unique index below.
  fingerprint  text not null,

  -- Which course this looks like. Null means "not sure" — and when it is null
  -- the screen asks rather than guessing.
  course_id    uuid references courses(id) on delete set null,
  -- For a class change: the lecture it is about. Written when accepting, or at
  -- extraction time if exactly one lecture matched.
  meeting_id   uuid references class_meetings(id) on delete set null,
  -- What accepting created. Null until then, and null for ever if rejected.
  task_id      uuid references tasks(id) on delete set null,

  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

-- THE constraint of this slice.
--
-- Running extraction over the same email twice must propose nothing the second
-- time — including, especially, something that was already rejected. Service
-- code checks nothing: it inserts with `on conflict do nothing` and this index
-- is what makes that correct. A check in TypeScript would be a check that a
-- future caller can forget.
create unique index email_proposals_email_fingerprint_key
  on email_proposals (email_id, fingerprint);

-- The one read /inbox does: everything still waiting, newest first.
create index on email_proposals (status, created_at desc);
create index on email_proposals (email_id);
create index on email_proposals (course_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table email_proposals enable row level security;

-- Ownership is inherited the same way `email_messages` inherits it: through the
-- connection, which hangs off auth.users. auth.uid() is wrapped in (select ...)
-- so Postgres evaluates it once per query rather than once per row.
create policy email_proposals_select on email_proposals for select to authenticated
  using (
    email_id in (
      select m.id
        from email_messages m
        join google_accounts g on g.id = m.google_account_id
       where g.user_id = (select auth.uid())
    )
  );
create policy email_proposals_insert on email_proposals for insert to authenticated
  with check (
    email_id in (
      select m.id
        from email_messages m
        join google_accounts g on g.id = m.google_account_id
       where g.user_id = (select auth.uid())
    )
  );
create policy email_proposals_update on email_proposals for update to authenticated
  using (
    email_id in (
      select m.id
        from email_messages m
        join google_accounts g on g.id = m.google_account_id
       where g.user_id = (select auth.uid())
    )
  )
  with check (
    email_id in (
      select m.id
        from email_messages m
        join google_accounts g on g.id = m.google_account_id
       where g.user_id = (select auth.uid())
    )
  );
create policy email_proposals_delete on email_proposals for delete to authenticated
  using (
    email_id in (
      select m.id
        from email_messages m
        join google_accounts g on g.id = m.google_account_id
       where g.user_id = (select auth.uid())
    )
  );
