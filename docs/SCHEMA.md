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
  computed_at      timestamptz,
  -- Slice 20. How many times this has gone fresh->stale. Monotonic: nothing in
  -- /review resets it, which is what makes "this summary has been out of date
  -- at least once" a question that can be asked long after the fact.
  stale_runs       int  not null default 0
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

## People (slice 18)

The first table about a *person* rather than about their semester. Everything else
in this file belongs to a workspace; a workspace belongs to an `auth.users` row
that, until this table, nothing ever had to name.

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,          -- lowercase; 3-20 of [a-z0-9_]
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Slice 21. Every "I have seen this" this account has said, as notice id ->
  -- the ISO timestamp it was said. Slice 20 shipped this as a single
  -- `onboarding_dismissed_at`; migration 016 folded it in here as the id
  -- `setup`, beside the five just-in-time hints. Replaces a cookie, which said
  -- the wrong thing the moment you opened the app on a second device.
  --
  -- The ids belong to the modules that show the notices — `modules/onboarding`
  -- owns `setup`, `modules/hints` owns the rest. This table only stores them.
  dismissed_notices jsonb not null default '{}'::jsonb
);

-- An `after insert` trigger on this table (migration 014) mirrors "this account
-- has a username" into auth.users.raw_app_meta_data, so the proxy reads it off
-- the JWT instead of spending a round trip on every signed-in request.
create unique index profiles_username_key on profiles (lower(username));
```

`id` **is** the `auth.users` id — there is no separate key. One row per account,
enforced by the primary key rather than by a unique index someone could forget.

The unique index is functional, on `lower(username)`, so `Aadit` and `aadit` are
the same name. `citext` would be tidier and is not worth an extension.

### Reading someone else's profile

`profiles_select` returns **your own row and nothing else**:

```sql
create policy profiles_select on profiles for select to authenticated
  using (id = (select auth.uid()));
```

That is deliberately too tight to look a friend up with, and the gap is filled by
one `security definer` function rather than by a wider policy:

```sql
find_profile_by_username(p_username text)
  returns table (id uuid, username text, display_name text)
  -- exact match, at most one row, never yourself
```

A policy permissive enough to find `@aadit` by name is permissive enough to list
every account on the app. Exact-string guessing is still possible and is an
accepted limit (docs/DECISIONS.md); prefix enumeration is not, and
`modules/profiles/username.test.ts` is what keeps it that way. Slice 22 adds
friends on top of this function and adds no search of its own.

**Nothing widens `profiles_select`, and that is a change of plan.** Slice 22 was
going to widen it to accepted friends; it does not. Slice 21 added
`dismissed_notices` to this table, and a policy is row-level — widening `select`
hands a friend every column on the row, today's and every one added later.
Reading another person goes through a `security definer` function that names the
fields, exactly as `find_profile_by_username` does:

```sql
my_friendships()
  returns table (id, other_id, other_username, other_display_name,
                 status, direction, i_share, they_share, created_at)
  -- every friendship the caller is in, at any status
  -- named from the caller's point of view: `i_share` is what I show them
```

Slice 23 widens nothing either: comparing timetables goes through a second
`security definer` function, because `sessions` reaches a workspace only through
`courses` and that policy is three tables deep already.

## Friends

```sql
create table friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id) on delete cascade,
  addressee_id  uuid not null references profiles(id) on delete cascade,
  status        text not null default 'pending',   -- pending | accepted
  -- What each side shows the other. Two independent decisions.
  --   none | busy (times only) | full (times, course code and room)
  requester_shares text not null default 'busy',
  addressee_shares text not null default 'busy',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One pair, once, whichever way round it was asked.
create unique index friendships_pair_key
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
```

There is no `declined` status: a refusal deletes the row, so declining,
cancelling and unfriending are one act with one policy.

**What each side may change is a trigger, not a policy.** Policies are
row-level, and both share levels are on the one row, so `friendships_update`
has to let either party write it. `friendships_guard` is what says the two
people never change, that only the person asked can accept, that status only
goes `pending → accepted`, and that each side may change only their own
`*_shares` column. That last rule is the privacy boundary of the feature.
`modules/friends/friendships.test.ts` proves all four with three real signed-in
sessions on the anon key — the service-role key bypasses RLS, so a test written
with it would pass whether any of this existed or not.

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
