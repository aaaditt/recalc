# Data model

Read this before writing any migration. The first four tables are the engine —
get them right and everything else is CRUD.

RLS is enabled on every table. The Supabase anon key is public; without a policy,
the data is public.

## Core

```sql
create extension if not exists vector;

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My workspace',
  created_at  timestamptz not null default now()
);

-- THE PRIMITIVE. Everything in the app is a row here.
create table blocks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  parent_id     uuid references blocks(id) on delete cascade,
  position      numeric not null,     -- fractional index: insert at midpoint, never renumber
  type          text not null,        -- text|heading|todo|course|unit|email|summary|question|answer|flashcard
  content       jsonb not null default '{}',
  version       int  not null default 1,   -- bumps ONLY on semantic change
  content_hash  text not null,             -- sha256 of NFKC-normalised, whitespace-collapsed text
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                -- soft delete: never destroy provenance
);
create index on blocks (workspace_id, parent_id, position);
create index on blocks (workspace_id, type) where deleted_at is null;
```

## The engine

```sql
create table derivations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  derived_block_id uuid not null references blocks(id) on delete cascade,
  recipe           text not null,   -- summarize|flashcards|answer|extract|plan
  model            text not null,   -- recorded for audit; app code never chooses this
  prompt_version   int  not null default 1,
  status           text not null default 'fresh',  -- fresh|stale|computing|error
  error            text,
  computed_at      timestamptz
);
create index on derivations (workspace_id, status);

create table derivation_sources (
  derivation_id   uuid not null references derivations(id) on delete cascade,
  source_block_id uuid not null references blocks(id) on delete cascade,
  source_version  int  not null,    -- the version this was computed against
  primary key (derivation_id, source_block_id)
);
create index on derivation_sources (source_block_id);
```

## The cascade — this trigger is the product

```sql
create or replace function mark_derivations_stale()
returns trigger language plpgsql as $$
begin
  update derivations d
     set status = 'stale'
   where d.status = 'fresh'
     and exists (
       select 1 from derivation_sources s
        where s.derivation_id  = d.id
          and s.source_block_id = NEW.id
          and s.source_version  < NEW.version
     );
  return NEW;
end $$;

create trigger blocks_version_cascade
  after update of version on blocks
  for each row when (OLD.version is distinct from NEW.version)
  execute function mark_derivations_stale();
```

## Search — versioned, so stale embeddings are provably dead

```sql
create table block_embeddings (
  block_id  uuid not null references blocks(id) on delete cascade,
  version   int  not null,
  embedding vector(1536),
  primary key (block_id, version)
);
```

Query only rows where `block_embeddings.version = blocks.version`. Old rows are
harmless leftovers; a cleanup job can delete them later.

## Semester layer

Flat projection tables. They duplicate a little data from `blocks` — that is
intentional, it keeps queries and UI simple.

There are **two** timetable tables and the distinction matters.

`sessions` is the *weekly pattern*: "ME301 meets Tuesdays 09:00-10:30 in B204".

`class_meetings` are the *actual dated lectures* generated from that pattern:
"ME301, Tue 14 Oct, 09:00, B204". This is what the calendar renders, what notes and
files attach to, and what slice 15 updates when an email says a class is cancelled.
Without it there is nowhere to hang "my notes from the October 14th lecture".

```sql
courses        (id, workspace_id, code, name, term, colour, instructor, credits)
               -- code is the subject code, e.g. 'ME301'. Shown everywhere.

sessions       (id, course_id, weekday, starts_at, ends_at, room,
                valid_from, valid_until)
               -- the recurring weekly pattern. weekday: 0=Sun .. 6=Sat

create table class_meetings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  session_id    uuid references sessions(id) on delete set null,  -- null for one-offs
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  room          text,
  topic         text,                                    -- what this lecture covered
  unit_id       uuid references syllabus_units(id),      -- syllabus topic covered
  status        text not null default 'scheduled',       -- scheduled|cancelled|moved|held
  note_block_id uuid references blocks(id),              -- the note doc for this lecture
  created_at    timestamptz not null default now()
);
create index on class_meetings (workspace_id, starts_at);
create index on class_meetings (course_id, starts_at);

syllabus_units (id, course_id, position, title, status, block_id)
               -- status: not_started | shaky | comfortable | mastered
tasks          (id, workspace_id, course_id, unit_id, meeting_id, title, notes,
                due_at, status, effort_min, source_block_id)
study_sessions (id, workspace_id, course_id, unit_id, started_at, ended_at, focus_rating)
```

Meetings are generated once at the start of term from `sessions` + term dates, then
edited individually. Never regenerate them wholesale afterwards — that would destroy
the notes and files attached to them.

## Files (Google Drive backed)

```sql
create table files (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  course_id      uuid references courses(id) on delete set null,
  meeting_id     uuid references class_meetings(id) on delete set null,
  block_id       uuid references blocks(id) on delete set null,  -- if embedded in a note
  provider       text not null,          -- 'drive' | 'supabase'
  provider_id    text not null,          -- Drive file id, or Storage path
  name           text not null,
  mime_type      text,
  size_bytes     bigint,
  web_view_link  text,
  thumbnail_link text,
  created_at     timestamptz not null default now()
);
```

A file can hang off a lecture, a course, or a note block. Big things (recordings,
scanned PDFs, slide decks) go to Drive; small pasted images go to Supabase Storage.
**Store the reference, never the bytes.**

## Email

One Google account can grant Gmail access, Drive access, or both — so the
connection table is per Google account, not per feature.

```sql
google_accounts (id, user_id, address, refresh_token_enc, granted_scopes text[],
                 last_history_id, synced_at, status)
                -- status: ok | needs_reconnect
                -- granted_scopes tells the app what this account may actually be used for
email_messages  (id, google_account_id, provider_msg_id, thread_id, sender, subject,
                 snippet, received_at, block_id)
email_proposals (id, email_id, kind, payload jsonb, confidence, status)
                -- status: proposed | accepted | rejected   <- human in the loop, always
```

## Agents (bring your own key)

```sql
agent_profiles (id, user_id, role, provider, model, api_key_enc, created_at)
               -- role: fast | deep | embed   (unique per user+role)
```

`api_key_enc` and `refresh_token_enc` are AES-256-GCM ciphertext. The key comes from
`process.env.ENCRYPTION_KEY` and is only ever read inside `modules/agents/crypto.ts`,
which is `import 'server-only'`. Never pgcrypto — do not put the key in the database.

## Normalisation rule for content_hash

```ts
const normalise = (s: string) =>
  s.normalize('NFKC').replace(/\s+/g, ' ').trim();
// content_hash = sha256(normalise(plainTextOf(content)))
```

A typo fix that changes meaning bumps the version. A whitespace or formatting change
does not. Later we can add a cheap-model "did this change the meaning?" gate for
larger diffs; do not build that until slice 08 is stable.


## Google scopes — and why Drive is easier than Gmail

| Feature | Scope | Google's classification | Consequence |
|---|---|---|---|
| Drive files | `drive.file` | **non-sensitive** | Basic verification only. Grants access *only to files I pick* via the Google Picker — not my whole Drive. Cleanest possible path. |
| Gmail read | `gmail.readonly` | **restricted** | Fine under 100 users, but shows an "unverified app" warning screen. |

Because `drive.file` is non-sensitive and per-file, **Drive lands before email** in the
build order. Never request `drive.readonly` — it is restricted, it grants access to
every file in my Drive, and we do not need it.
