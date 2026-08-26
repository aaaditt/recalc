-- 005_drive.sql — slice 09
--
-- Two tables from docs/SCHEMA.md, plus one Storage bucket.
--
-- `google_accounts` is deliberately NOT a "drive_accounts" table. One Google
-- account can grant Drive access, Gmail access, or both, and it is one refresh
-- token either way (docs/DECISIONS.md, "One google_accounts table shared by
-- Drive and Gmail"). `granted_scopes` is what tells the app which features this
-- account may actually be used for — slice 14 adds gmail.readonly to the same
-- row rather than a second table.
--
-- `files` stores REFERENCES, never bytes (docs/SCHEMA.md: "Store the reference,
-- never the bytes"). Big things — slide decks, recordings, scanned PDFs — live
-- in the user's own Drive under `Recalc/<course code>/`. Small pasted images
-- live in Supabase Storage, because they are not files anyone would go looking
-- for in Drive.
--
-- Append-only: never edit this file once applied.

-- ---------------------------------------------------------------------------
-- google_accounts
-- ---------------------------------------------------------------------------

create table google_accounts (
  id                uuid primary key default gen_random_uuid(),
  -- Per user, not per workspace: a Google account is a fact about the person,
  -- and auth.users is the only thing that outlives a workspace.
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- The Google account's email address. Shown in settings so it is obvious
  -- which of several Google accounts is connected.
  address           text not null,
  -- AES-256-GCM ciphertext from lib/crypto.ts. The key is in the environment,
  -- never in this database (docs/DECISIONS.md, "Encryption key in env, not in
  -- the database"). Never pgcrypto.
  refresh_token_enc text not null,
  -- Exactly what Google said it granted, verbatim. The app checks this before
  -- offering a feature rather than assuming the consent screen was obeyed.
  granted_scopes    text[] not null default '{}',
  -- Gmail's incremental sync cursor. Unused until slice 14; the column is here
  -- because this table is shared and adding it later means another migration.
  last_history_id   text,
  synced_at         timestamptz,
  -- ok | needs_reconnect. Set to needs_reconnect the moment a refresh comes
  -- back invalid_grant, which is what a revoked token looks like.
  status            text not null default 'ok',
  created_at        timestamptz not null default now(),
  constraint google_accounts_status_check check (status in ('ok', 'needs_reconnect'))
);

-- Reconnecting the same Google account updates the row rather than adding a
-- second one with a stale refresh token beside it.
create unique index google_accounts_user_address_key
  on google_accounts (user_id, lower(address));
create index on google_accounts (user_id);

-- ---------------------------------------------------------------------------
-- files
-- ---------------------------------------------------------------------------

create table files (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  -- All three are optional and all three are "where this file is shown".
  -- set null rather than cascade: losing a course must not silently destroy
  -- the record of a file that is still sitting in Drive.
  course_id      uuid references courses(id) on delete set null,
  meeting_id     uuid references class_meetings(id) on delete set null,
  block_id       uuid references blocks(id) on delete set null,
  -- 'drive'    — provider_id is the Drive file id
  -- 'supabase' — provider_id is the object path inside the note-images bucket
  provider       text not null,
  provider_id    text not null,
  name           text not null,
  mime_type      text,
  size_bytes     bigint,
  web_view_link  text,
  thumbnail_link text,
  created_at     timestamptz not null default now(),
  constraint files_provider_check check (provider in ('drive', 'supabase'))
);

create index on files (workspace_id, created_at desc);
create index on files (meeting_id);
create index on files (course_id);
create index on files (block_id);

-- The same Drive file may legitimately be attached to two different lectures,
-- so the identity of an attachment is the file AND where it hangs. `nulls not
-- distinct` is what makes two unattached rows for the same file collide
-- instead of both being inserted; without it a double-tap on "Attach" adds the
-- deck twice. modules/files checks first — this is the backstop.
create unique index files_attachment_key
  on files (workspace_id, provider, provider_id, meeting_id, course_id, block_id)
  nulls not distinct;

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
-- ---------------------------------------------------------------------------

alter table google_accounts enable row level security;
alter table files enable row level security;

-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row.

-- google_accounts hangs off the user directly, so ownership is the uid itself.
create policy google_accounts_select on google_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy google_accounts_insert on google_accounts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy google_accounts_update on google_accounts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy google_accounts_delete on google_accounts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy files_select on files for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy files_insert on files for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy files_update on files for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));
create policy files_delete on files for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Storage — where a small pasted image goes
--
-- prompts/09-drive.md point 6: "Small pasted images in notes go to Supabase
-- Storage, not Drive — Drive is for files I would want to find in Drive."
--
-- Private bucket. Objects are named `<workspace_id>/<uuid>.<ext>`, so the first
-- path segment is the ownership check, and the app hands out short-lived signed
-- URLs rather than making the bucket public.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('note-images', 'note-images', false, 5242880)
on conflict (id) do nothing;

create policy note_images_select on storage.objects for select to authenticated
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_id = (select auth.uid())
    )
  );
create policy note_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_id = (select auth.uid())
    )
  );
create policy note_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_id = (select auth.uid())
    )
  );
create policy note_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_id = (select auth.uid())
    )
  );
