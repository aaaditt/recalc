# Slice 09 — Google Drive

Read `CLAUDE.md` and the "Files" and "Google scopes" sections of `docs/SCHEMA.md`.

## Goal

I attach lecture slides, a photo of the whiteboard, and a problem sheet to a specific
lecture — stored in my own Drive, visible in the app.

## Build

1. **Migration** — `google_accounts` and `files` per SCHEMA.md. (`google_accounts` is
   shared with email later; build it properly now.)

2. **Google OAuth** — connect flow requesting **`drive.file` only**. Store the
   refresh token encrypted with `modules/agents/crypto.ts`. Record granted scopes in
   `granted_scopes`.

3. **Google Picker** — the "attach existing file" flow. The Picker is what grants
   `drive.file` access to the files I choose; the app never sees the rest of my Drive.
   Store id, name, mime type, size, web view link and thumbnail in `files`.

4. **Upload** — drag a file onto a lecture, or take a photo on mobile, and it uploads
   to a `Recalc/<course code>/` folder in my Drive, created on first use. Reference
   stored in `files`.

5. **Attachment UI** on the lecture page — thumbnail grid, opening in place for
   images and PDFs where possible, otherwise opening in Drive. Remove-from-app must
   be clearly distinct from delete-from-Drive; **the app never deletes a Drive file**.

6. **Small pasted images** in notes go to Supabase Storage, not Drive — Drive is for
   files I would want to find in Drive.

7. **Failure states** — a revoked token, a deleted-in-Drive file, an offline device.
   Each degrades with a plain message. A missing thumbnail is not an error page.

## Constraints

- **`drive.file` only. Never `drive.readonly` or `drive`.** Those are restricted
  scopes, they grant access to my entire Drive, and we do not need them.
- Store references, never bytes. No copies in Postgres.
- Everything must still work with no Drive account connected.

## Definition of done

I will: connect Drive, attach a real lecture slide deck to a real lecture from the
calendar, take a photo of a whiteboard on my phone and see it appear on that lecture,
and then confirm both files are sitting in a `Recalc/` folder in my actual Drive.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
