# Setup — do this before slice 00

About 30 minutes. Do it all now; two of these items will otherwise cost you an
evening each, weeks from now, when you have forgotten why.

---

## 1. On your machine

- **Node 20 or newer** — check with `node -v`
- **Git** — check with `git -v`
- **Claude Code** — you have it
- **VS Code** open on the project folder

```bash
mkdir -p ~/projects/recalc
cd ~/projects/recalc
git init
# unzip the starter kit in here, so CLAUDE.md sits at the top level
```

---

## 2. Supabase — the database

1. Sign up at supabase.com, create a **new project**.
2. Region: **South Asia (Mumbai)** — closest to Dubai, lowest latency.
3. **Save the database password somewhere you will find it again.** It is shown once.
4. Project Settings → API. Copy three values:
   - Project URL
   - `anon` public key
   - `service_role` secret key — **this one never goes in the browser**
5. Install the CLI: `npm i -g supabase`, then `supabase login`.

Free tier: 500MB database, 1GB file storage, 2 active projects. A full degree of
notes will not come close to 500MB.

---

## 3. Google Cloud — for Drive and email

You will not use this until slice 09. Do it now anyway; the two settings below are
the ones people get wrong and discover six weeks later.

1. console.cloud.google.com → **new project**, call it `recalc`.
2. **APIs & Services → Library → enable three APIs:** Gmail API, Google Drive API,
   and Google Picker API.
3. **OAuth consent screen** → User type: **External**.
4. ⚠️ **Publishing status → "In production".** Not "Testing".
   An external app left in Testing issues refresh tokens that **expire after 7 days**.
   You would be reconnecting your email every single week, forever.
5. You do **not** need Google verification. Under 100 users, an unverified app is
   allowed even with Gmail's restricted scopes. You will see an "unverified app"
   warning the first time you connect — click **Advanced → Go to recalc (unsafe)**.
   That is expected and correct here.
6. **Scopes.** Add only these, and never more:
   - `https://www.googleapis.com/auth/drive.file` — non-sensitive. Gives access
     *only* to files you explicitly pick. Used from slice 09.
   - `https://www.googleapis.com/auth/gmail.readonly` — restricted, but fine under
     100 users. Used from slice 14.

   Never add `drive.readonly` or `drive`. Those grant access to your entire Drive and
   we do not need them.

7. **Credentials → Create OAuth client ID → Web application.**
   Authorised redirect URIs:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://<your-app>.vercel.app/api/auth/google/callback` (add once deployed)
8. Copy the Client ID and Client Secret.
9. **Credentials → Create API key** — the Google Picker needs one. Restrict it to the
   Picker API.

### Test your university account can be used at all — 2 minutes

Some university Workspace admins block third-party apps entirely. Find out now,
not at slice 11.

Sign in to any third-party service with your university Google account. If you get
**"This app is blocked"** or **"admin_policy_enforced"**, your admin has locked it
down — the personal Gmail account will still work, and we can revisit the university
one later. Tell me the result either way.

---

## 4. Vercel — hosting

Sign up at vercel.com with your GitHub account. Nothing else to do until slice 02.

---

## 5. Your `.env.local`

Create this at the project root. It is gitignored — never commit it.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 32 random bytes, base64. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Lose this and every stored API key becomes unreadable. Back it up.
ENCRYPTION_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=

# Optional until slice 14, and only needed on Vercel. The hourly email sync
# (vercel.json -> /api/cron/sync-email) runs with no signed-in user, so the
# route refuses anything that does not present this. Generate it the same way
# as ENCRYPTION_KEY. Without it the scheduled sync is simply off — "Sync now"
# on /settings/email still works.
CRON_SECRET=
```

---

## 6. Then start

```bash
cd ~/projects/recalc
claude
```

Paste the whole contents of `prompts/00-foundation.md`. Nothing else. Let it work.

---

## The loop, every time

1. Paste one prompt file
2. Let it build; it will stop and tell you what to check
3. **Actually do the check**
4. `git add -A && git commit -m "slice NN: <what>"`
5. `/clear`
6. Next prompt

Step 3 is the one people skip. Skipping it is how you end up debugging four slices
at once instead of one.
