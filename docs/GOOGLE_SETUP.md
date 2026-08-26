# Connecting Google Drive

About twenty minutes, once. `SETUP.md` section 3 said to do this before slice 00
and that you would not need it until slice 09 — this is slice 09, and this file is
the exact version of those steps.

Nothing in the app breaks while this is undone. Every screen renders with no Drive
account connected; pasting a photo into a lecture note already works, because small
images go to Supabase Storage rather than Drive. What is missing until you finish
this is: attaching a file from Drive, and uploading a slide deck to
`Recalc/<course code>/`.

---

## What Recalc will and will not be able to see

One scope, and no more:

```
https://www.googleapis.com/auth/drive.file
```

Google classifies it **non-sensitive**. It grants access **only** to files you hand
over through the Google Picker, plus files Recalc itself created. The rest of your
Drive is invisible to it, and stays invisible.

`drive.readonly` and `drive` are **restricted** scopes: they grant your entire Drive
and they trigger a Google security assessment. Recalc never asks for either, and
there is a test (`modules/google/drive-scope.test.ts`) that fails the build if a
future change tries to.

---

## 1. Make a Google Cloud project

1. Go to <https://console.cloud.google.com>.
2. Top bar → the project dropdown → **New project**.
3. Name it `recalc`. Leave the organisation as it is. **Create**.
4. Make sure `recalc` is the project selected in the top bar before going on.
   Everything below applies to the selected project, and doing step 5 in the wrong
   project is the most common way this goes wrong.

## 2. Enable the two APIs

**APIs & Services → Library**, search for and **Enable** each of:

- **Google Drive API** — uploading, folders, file metadata
- **Google Picker API** — the "attach an existing file" dialog

(The Gmail API is slice 14. Enable it now if you like; nothing in slice 09 uses it.)

## 3. OAuth consent screen

**APIs & Services → OAuth consent screen** (newer consoles call it
*Google Auth Platform → Branding / Audience*).

1. **User type: External.** Create.
2. App name: `Recalc`. User support email: your own. Developer contact: your own.
3. **Audience → Publishing status: In production.** Press **Publish app**.

   ⚠️ **Not "Testing".** An external app left in Testing issues refresh tokens that
   **expire after seven days**. You would be reconnecting Drive every week forever.
   This is the single setting people get wrong and discover six weeks later.

4. You do **not** need Google verification. Under 100 users an unverified app is
   allowed, and `drive.file` is non-sensitive anyway. The first time you connect you
   may see an "unverified app" warning — **Advanced → Go to Recalc (unsafe)**. That
   is expected here.
5. **Data access / Scopes → Add or remove scopes.** Add exactly:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

   Nothing else. Never `drive.readonly`, never `drive`.

## 4. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- Application type: **Web application**
- Name: `Recalc web`
- **Authorised redirect URIs** — add both, exactly as written, no trailing slash:

  ```
  http://localhost:3000/api/auth/google/callback
  https://<your-app>.vercel.app/api/auth/google/callback
  ```

  The second one only once you have deployed; you can come back and add it. The
  path is `/api/auth/google/callback` and the app builds it from whatever origin
  the browser is on, so it must match character for character.

- **Create.** Copy the **Client ID** and **Client secret**.

Authorised JavaScript origins are not needed — the app never starts the OAuth
handshake from browser JavaScript.

## 5. Create the Picker API key

The Picker needs a *developer key*, which is separate from the OAuth client.

**Credentials → Create credentials → API key.**

1. Copy the key.
2. **Edit API key → API restrictions → Restrict key → Google Picker API.** Only that
   one.
3. **Application restrictions → Websites**, and add `http://localhost:3000/*` and
   your Vercel origin. (Optional, and worth doing.)

This key is public by design — it identifies the Cloud project to the Picker and
grants nothing on its own. It is the only Google value in the app that is allowed
to have a `NEXT_PUBLIC_` prefix.

---

## 6. Fill in `.env.local`

`.env.local` is at the project root and is gitignored. It should end up with:

```bash
# 32 random bytes, base64. Protects the stored Google refresh token.
# Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=

GOOGLE_CLIENT_ID=<the client ID from step 4>
GOOGLE_CLIENT_SECRET=<the client secret from step 4>

# The Picker's developer key, from step 5. Public.
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=<the API key>
```

Three notes:

- **`ENCRYPTION_KEY` is already filled in** — slice 09 generated one for you. If you
  change it, every refresh token and (from slice 10) every stored API key becomes
  unreadable and has to be re-entered. **Back it up** somewhere that is not this
  repository.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` currently hold the placeholders
  `replace-me...`. The app boots with them, and the Connect button will bounce off
  Google with `invalid_client` until they are real.
- All three of `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
  now **required** in `lib/env.server.ts`. If one is missing the app refuses to
  boot, loudly, rather than failing at the moment you press Connect.

Restart `npm run dev` after editing `.env.local` — Next reads it once, at start.

### On Vercel

Add the same four to **Project → Settings → Environment Variables**, and add the
production redirect URI (step 4) to the OAuth client. `ENCRYPTION_KEY` must be the
*same* value as locally, or tokens stored on one will not open on the other.

---

## 7. Connect it

1. `npm run dev`
2. Go to **/settings/drive** (or press **Drive** in the calendar's header).
3. **Connect Drive** → choose your Google account → allow.
4. You land back on `/settings/drive`, which now shows the address and one granted
   scope: `.../auth/drive.file`.

---

## 8. Check it does what the slice promised

`prompts/09-drive.md`'s definition of done, in order:

1. Open a lecture from the calendar.
2. **Attach from Drive** → pick an existing slide deck → it appears in the grid with
   a thumbnail.
3. **Upload a file** → drop a PDF on the dotted area → it uploads to
   `Recalc/<course code>/`.
4. On your phone, open the same lecture → **Take a photo** → photograph anything →
   it appears.
5. Open Drive itself and confirm there is now a **`Recalc/`** folder with a folder
   per course code inside it, holding what you uploaded.
6. Press **Remove** on a tile. The sheet must say the file **stays in your Drive**.
   Confirm, then check Drive: the file is still there.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| `invalid_client` on Google's page | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are still the placeholders, or belong to a different Cloud project. |
| `redirect_uri_mismatch` | The URI in step 4 does not match, character for character. Check for a trailing slash, `http` vs `https`, and the port. |
| "That connect link had expired" | The one-time state cookie was lost — you took more than ten minutes, or opened the callback in a different browser. Press Connect again. |
| "Google did not return a refresh token" | Google already has a grant for this app and skipped consent. Go to <https://myaccount.google.com/permissions>, remove Recalc, connect again. |
| "The Google Picker needs NEXT_PUBLIC_GOOGLE_PICKER_API_KEY" | Step 5 is not done, or the dev server was not restarted after editing `.env.local`. |
| The Picker opens and shows nothing | The API key is restricted to the wrong API, or the Picker API is not enabled (step 2). |
| "Google Drive needs reconnecting" | The refresh token was revoked — you removed the app in your Google account, or the consent screen is back in *Testing* and the token aged out after seven days. Check step 3.3, then press Reconnect. |
| A tile shows `PDF`/`JPG` instead of a picture | Drive has no thumbnail for that file. Not an error; the file still opens. |
| "This file is no longer in your Drive." | You deleted it in Drive. Recalc never does that — press **Remove** on the tile to tidy up the link. |
