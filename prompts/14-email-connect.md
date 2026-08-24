# Slice 14 — Email: connect and sync

Read `CLAUDE.md` and the "Email" section of `docs/SCHEMA.md` first. Also re-read
`SETUP.md` section 3 — the OAuth settings matter here.

## Goal

Both my Gmail accounts connect, sync incrementally, and stay connected. Ingestion
only — no interpretation at all in this slice.

## Build

1. **Migration** — `email_messages` per SCHEMA.md. `google_accounts` already exists
   from slice 09 — **extend it, do not create a second account table.** Connecting
   Gmail on an already-connected Drive account adds a scope to `granted_scopes`; it
   does not create a new row.

2. **Google OAuth** — `/api/auth/google/start` and `/callback`. Scope:
   `gmail.readonly` **only**, added incrementally to whatever the account already
   granted. Request offline access so we get a refresh token. Encrypt it with the
   same `modules/agents/crypto.ts` used for API keys and Drive. Multiple Google
   accounts per user — one row each.

3. **Incremental sync** — first sync pulls the last 30 days. Every sync after that
   uses Gmail's `history.list` with the stored `last_history_id`, so we only fetch
   what changed. If the history id is too old and Gmail rejects it, fall back to a
   bounded re-sync and log it.

4. **Store minimally** — sender, subject, snippet, received time, thread id. Do not
   store full message bodies yet. Create a `block` of type `email` per message so
   emails are first-class in the system.

5. **Token failure is a normal state, not a crash.** A refresh token dies when I
   change my Google password, or after six months unused. Set the account `status`
   to `needs_reconnect` and show a quiet banner. Never throw a 500 at me for this.

6. **`/settings/email`** — connected accounts, last synced time, connect/disconnect,
   reconnect.

7. **Sync trigger** — a route handler at `/api/cron/sync-email` plus a Vercel cron
   entry. Manual "sync now" button too.

## Constraints

- **Read-only. The app never sends, replies to, deletes, or labels anything.**
- No AI in this slice. Zero interpretation.
- Never log message contents.

## Definition of done

I will: connect both accounts, click through the "unverified app" warning, see recent
mail listed, click sync again and watch it fetch only new messages rather than
re-reading everything.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
