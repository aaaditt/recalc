# Slice 18 — what you need to do

A one-time runbook. Delete this file once you have been through it.

**Time:** about 3 minutes for the required part, plus 10 if you want the
"Continue with Google" button working.

Everything is run from a terminal in the project folder. In Claude Code you can
prefix a command with `!` to run it in the session.

---

## First: what NOT to do

These are the things that would waste your time or break something.

| Don't | Why |
|---|---|
| **Don't open the Supabase SQL editor and paste anything.** | The migration runs from your terminal. Pasting it by hand would apply the SQL but *not* record it in the migration ledger, and then `db push` would try to run it again next time and fail. This exact thing already happened once in this project — see `DECISIONS.md`, slice 01. |
| **Don't create a new Supabase project.** | That was the original plan and it turned out to be unnecessary. You are staying on the project you already have (`recalc`). |
| **Don't touch `.env.local`.** | Slice 18 adds **no new environment variables**. Nothing to fill in. |
| **Don't delete anything in the Supabase dashboard.** | The migration does all the deleting, in the right order. |
| **Don't run the trip app while pointed at this project.** | It isn't — its `.env.local` points at `georgia-trip` and it's fine. Just don't change it back. |

---

## Step 1 — Run the migration *(required)*

```bash
npm run db:push
```

It will list `013_profiles.sql` and ask for confirmation. **Press `Y`.**

### What this actually does

Two separate jobs in one file:

1. **Evicts the trip app** from this database — 18 tables, 28 functions, and one
   trigger. None of them were ever created by a Recalc migration; they got here
   when the trip app was pointed at this project for a couple of days in
   late August. That app now points at its own `georgia-trip` project, which is
   where this data really lives.

2. **Creates `profiles`** — the table holding usernames — plus one lookup
   function and its security policies.

### Is anything of yours destroyed?

No Recalc data. Your two workspaces, your account, your login: all untouched.

The trip rows that *are* destroyed (94 of them) were backed up to JSON before
anything ran:

```
C:\Users\aadit\AppData\Local\Temp\claude\C--Aadit-Personal-code-ide-antigravity-recalc-recalc\7c83594b-96d3-483c-a425-1064047c8bb0\scratchpad\trip-tables-backup.json
```

That's a temp folder, so copy it somewhere safe if you want to keep it. The
`georgia-trip` project has the same data.

### How you know it worked

You should see something like `Finished supabase db push.` with no errors.

---

## Step 2 — Regenerate the TypeScript types *(required)*

```bash
npm run db:types
```

This rewrites `lib/database.types.ts` from the live database.

**The check that proves step 1 worked:** that file is currently **2402 lines**,
about half of which describe the trip app's tables. Afterwards it should be
roughly **1200**, and searching it for `trip_members` should find nothing.

```bash
wc -l lib/database.types.ts
grep -c "trip_members" lib/database.types.ts    # should print 0
```

---

## Step 3 — Run the checks *(required)*

```bash
npm run check
```

This is typecheck + lint + all 440 tests. **All of them should pass.**

Right now, before you run step 1, 9 of them fail — the new
`modules/profiles/username.test.ts` ones. That is expected and it is the whole
point: they fail because the trip app's `profiles` table is still sitting where
Recalc's needs to be. After the migration they pass.

If anything else fails, stop and tell me rather than pressing on.

---

## Step 4 — Try it by hand *(required)*

```bash
npm run dev
```

Then, in order:

1. **Go to `http://localhost:3000/today`.**
   You are already signed in, but you have no username yet — so you get bounced
   to **`/welcome`**. This is the new gate, and it is the only screen in the app
   that blocks you.

2. **Try to escape it.** Type `/today` in the address bar again. You come
   straight back to `/welcome`. Same for `/courses`, `/calendar`, anything.

3. **Pick a username.** Try a few things first to see the rules working:
   - `ab` → too short
   - `aadit chandra` → rejected, spaces aren't allowed
   - `today` → rejected, it's a route name
   - `aadit` → accepted

   Display name is optional; leave it blank if you like.

4. **You land on `/today`.** The setup card at the top now has **five** steps
   instead of three — the two new ones are "Add an AI key" and "Connect Google".

5. **Go back to `/welcome` deliberately.** It redirects you to `/today`. The
   screen is reachable exactly once, which is the point.

### Optional: prove the isolation

If you want to see the multi-user part actually work, sign out and sign in with
a **different email address**. You'll get `/welcome` again, then a completely
empty timetable — none of your first account's courses, notes or tasks. Try
claiming the username you already took (in any casing, `AADIT` counts) and it
will refuse.

⚠️ Supabase's built-in email sender is rate-limited to a handful of magic links
per hour. If the second link doesn't arrive, that's why — not a bug. Doing
Step 5 first gives you a way in that doesn't need email at all.

---

## Step 5 — "Continue with Google" *(optional)*

The button is already on `/login`. Until you do this, pressing it returns an
error; **magic-link sign-in works regardless**, so you can skip this entirely.

### 5a. Add a redirect URI in Google Cloud

Go to **APIs & Services → Credentials**, open your existing `Recalc web` OAuth
client, and under **Authorised redirect URIs** add this third entry:

```
https://vdqudpiuqgdzgpvxjfgq.supabase.co/auth/v1/callback
```

Keep the two that are already there. Save.

### 5b. Turn the provider on in Supabase

**Supabase dashboard → Authentication → Sign In / Providers → Google.**

- Enable it.
- Paste in the **same** Client ID and Client secret you already have in
  `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. You are not
  making new ones.
- Save.

### The thing that confuses everyone

**Signing in with Google does not give Recalc access to your Drive or your
Gmail.** It only proves who you are.

A Google OAuth client identifies *an application*, not a person and not a
feature. Recalc has exactly one, used three ways — to sign you in, to attach a
Drive file, and to read your mail. Only the last two ask for permission that
touches your data, and they ask separately, on `/settings/drive` and
`/settings/email`. So after signing in with Google you will *still* have to
press Connect on those pages. That's deliberate, not a bug — bundling a mail-
reading permission into a login button is how apps end up holding access nobody
meant to give them.

`/login` says this in one line under the form, for the same reason.

---

## Step 6 — Commit *(when you're happy)*

```bash
git add -A
git commit -m "slice 18: usernames, the welcome gate, and Google sign-in"
```

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `must be owner of relation users` | The migration tried to drop a trigger on `auth.users`, which your database role doesn't own. | Shouldn't happen — the migration drops the *function* with `cascade` instead, precisely to avoid this. If it does, tell me. |
| `relation "profiles" already exists` | Step 1 was run twice, or part of it was pasted by hand. | Tell me before doing anything else; don't re-run. |
| `Found local migration files to be inserted before the last migration` | The ledger and your files have diverged. | Run `npx supabase migration list` and send me the output. |
| 9 tests still failing after step 1 | The migration didn't actually apply. | Re-read step 1's output for an error you may have scrolled past. |
| `/welcome` won't let you through and shows no error | Server action failed silently. | Check the terminal running `npm run dev` for a stack trace. |
| `redirect_uri_mismatch` on the Google button | Step 5a's URI doesn't match character for character. | Check for a trailing slash, and that it's `https`. |
| Magic link never arrives | Supabase's built-in mailer is rate-limited. | Wait an hour, or use Google sign-in (step 5). |

---

## What actually changed, in one paragraph

You now have a username, and so will anyone else who signs up. A brand-new
account is asked for one on `/welcome` before it can reach anything, because a
friends list needs a name to type — and that is the only thing in this app that
blocks you; every other setup step is still a line on a card you can skip
forever. Nobody can look you up except by typing your username exactly: there is
no search, on purpose, because a search box that finds people by prefix lets
anyone list every account on the app, and that isn't undoable once other people
have joined. Your notes, tasks, courses and files are exactly as private as they
were yesterday. Slices 19 (friend requests) and 20 (comparing two timetables)
build on this, and neither is written yet.
