-- 010_email.sql — slice 14
--
-- One table. `google_accounts` already has everything Gmail needs — slice 09
-- put `last_history_id`, `synced_at` and `status` on it on purpose, with the
-- comment "unused until slice 14; the column is here because this table is
-- shared and adding it later means another migration". It was right, so this
-- migration adds no column to it and creates no second account table.
-- Connecting Gmail on an already-connected Drive account ADDS
-- gmail.readonly to `granted_scopes` on the row that is already there.
--
-- `email_messages` stores the shape docs/SCHEMA.md names and nothing more:
-- sender, subject, snippet, received time, thread id. **No message bodies.**
-- prompts/14-email-connect.md point 4 is explicit about it, and the smallest
-- way to keep a promise like that is to have nowhere to put the thing.
--
-- Append-only: never edit this file once applied.

create table email_messages (
  id                uuid primary key default gen_random_uuid(),
  -- Which connected Google account this arrived in. Deleting the connection
  -- deletes the mail we cached from it — the messages are still in Gmail, and
  -- keeping rows nobody can re-sync would be keeping mail we cannot verify.
  google_account_id uuid not null references google_accounts(id) on delete cascade,
  -- Gmail's own ids. `provider_msg_id` is the identity of a message; the
  -- unique index below is what makes a re-sync idempotent.
  provider_msg_id   text not null,
  thread_id         text not null,
  -- The raw `From:` header, verbatim: "Dr Ada Byron <ada@uni.example>".
  sender            text not null,
  -- Nullable because a message may genuinely have neither.
  subject           text,
  snippet           text,
  received_at       timestamptz not null,
  -- The `email` block created for this message, so an email is first-class in
  -- the same table as everything else the user reads. set null, not cascade:
  -- losing the block must not silently lose the record that the mail arrived.
  block_id          uuid references blocks(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- The whole point of incremental sync: seeing the same message twice must
-- update nothing and insert nothing. modules/gmail checks before it writes;
-- this is the backstop that makes the check unnecessary rather than load-bearing.
create unique index email_messages_account_msg_key
  on email_messages (google_account_id, provider_msg_id);

-- The one read a screen does: newest mail for an account.
create index on email_messages (google_account_id, received_at desc);
create index on email_messages (thread_id);
create index on email_messages (block_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table email_messages enable row level security;

-- Ownership is inherited from the connection, which hangs off auth.users.
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per
-- query rather than once per row, the same shape as every other policy here.
create policy email_messages_select on email_messages for select to authenticated
  using (
    google_account_id in (
      select id from google_accounts where user_id = (select auth.uid())
    )
  );
create policy email_messages_insert on email_messages for insert to authenticated
  with check (
    google_account_id in (
      select id from google_accounts where user_id = (select auth.uid())
    )
  );
create policy email_messages_update on email_messages for update to authenticated
  using (
    google_account_id in (
      select id from google_accounts where user_id = (select auth.uid())
    )
  )
  with check (
    google_account_id in (
      select id from google_accounts where user_id = (select auth.uid())
    )
  );
create policy email_messages_delete on email_messages for delete to authenticated
  using (
    google_account_id in (
      select id from google_accounts where user_id = (select auth.uid())
    )
  );
