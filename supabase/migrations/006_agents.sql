-- 006_agents.sql — slice 10
--
-- One table from docs/SCHEMA.md, "Agents (bring your own key)":
--
--   agent_profiles (id, user_id, role, provider, model, api_key_enc, created_at)
--                  -- role: fast | deep | embed   (unique per user+role)
--
-- Keyed by `user_id`, NOT `workspace_id` — the second table in this project to
-- differ (google_accounts in 005 was the first, for the same reason). An API key
-- is a fact about the person, not about a workspace: `auth.users` is the only
-- thing that outlives a workspace, and re-creating a workspace must not mean
-- pasting three API keys in again. docs/SCHEMA.md names the column and the
-- uniqueness rule explicitly, so this follows it exactly.
--
-- `api_key_enc` is AES-256-GCM ciphertext produced by lib/crypto.ts. The key
-- lives in `process.env.ENCRYPTION_KEY` and never in this database
-- (docs/DECISIONS.md, "Encryption key in env, not in the database"). Never
-- pgcrypto: storing the key beside the ciphertext defeats the point.
--
-- Append-only: never edit this file once applied.

create table agent_profiles (
  id           uuid primary key default gen_random_uuid(),
  -- Per user, not per workspace. See the note above.
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- fast | deep | embed. CLAUDE.md's Never rule 6: app code asks for a role,
  -- and this row is what decides which model answers.
  role         text not null,
  -- anthropic | google | openai. Which SDK the registry builds the model with.
  provider     text not null,
  -- The provider's own model id, e.g. 'claude-opus-5'. This column is the ONLY
  -- place in the whole system a model name is chosen — the user picks it here,
  -- app code never names one.
  model        text not null,
  -- AES-256-GCM ciphertext from lib/crypto.ts. Never leaves the server, never
  -- leaves modules/agents, and is never selected into anything a page renders.
  api_key_enc  text not null,
  -- The last four characters of the key, in the clear, so the settings screen
  -- can render "sk-ant-…4f2a" WITHOUT decrypting anything. Rendering a page
  -- must never touch the plaintext; the only moment the key is decrypted is the
  -- moment a provider is actually called. Four characters identify which key
  -- was pasted and are useless on their own.
  key_hint     text not null default '',
  created_at   timestamptz not null default now(),
  -- Re-pasting a key updates the row, so `created_at` would go stale and the
  -- screen could not say when the key was last changed.
  updated_at   timestamptz not null default now(),
  constraint agent_profiles_role_check
    check (role in ('fast', 'deep', 'embed')),
  constraint agent_profiles_provider_check
    check (provider in ('anthropic', 'google', 'openai'))
);

-- docs/SCHEMA.md: "unique per user+role". One model fills each role at a time;
-- changing provider replaces the row rather than adding a second one beside it.
create unique index agent_profiles_user_role_key on agent_profiles (user_id, role);

-- ---------------------------------------------------------------------------
-- Row Level Security — the anon key ships to the browser; no policy = public data
--
-- Same shape as google_accounts in migration 005: ownership is the uid itself,
-- because this table hangs off auth.users directly rather than off a workspace.
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query,
-- not once per row.
-- ---------------------------------------------------------------------------

alter table agent_profiles enable row level security;

create policy agent_profiles_select on agent_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy agent_profiles_insert on agent_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy agent_profiles_update on agent_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy agent_profiles_delete on agent_profiles for delete to authenticated
  using (user_id = (select auth.uid()));
