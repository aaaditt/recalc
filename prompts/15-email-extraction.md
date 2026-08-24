# Slice 15 — Email: extraction

Read `CLAUDE.md` and `docs/PRODUCT.md` first. Slices 11 and 14 must be working.

## Goal

A real course announcement becomes a proposed task I accept in one tap — and a
society newsletter becomes nothing at all.

## Build

1. **Migration** — `email_proposals` per SCHEMA.md.

2. **Extraction is a derivation.** Recipe `extract`, source = the email block. It
   runs through the slice 11 worker like every other recipe. Do not write a separate
   pipeline for email.

3. **A cheap gate first.** Before spending a `deep` call, use the `fast` model (or
   plain heuristics — sender domain, keywords) to decide whether this email is even
   plausibly course-related. Most mail is not. Skipping this makes every sync
   expensive and slow.

4. **Extract**: deadlines, class changes (cancelled, room moved, rescheduled), and
   material references. Each becomes a row in `email_proposals` with `status
   = 'proposed'`, the payload, and a link to the email it came from.

5. **`/inbox`** — the proposals queue. Each shows what it found, the email it came
   from, and Accept / Reject. Accepting creates the task or updates the session.
   Rejecting keeps the row so the same email never re-proposes.

6. **Course matching** — match to a course by sender, subject or code, and show which
   course it thinks it is. When unsure, ask rather than guessing.

## Constraints

- **Proposals only. Nothing is ever written into my task list automatically.**
  An AI that silently invents forty fake deadlines gets deleted on day two.
- Never propose the same thing twice from the same email.
- Show me what it extracted *and* the sentence it extracted it from, so I can judge
  in one glance.

## Definition of done

I will: sync, open `/inbox`, and find a real deadline from a real course email that I
accept in one tap — with no junk proposals from newsletters sitting beside it.

## Then

Update `docs/SLICES.md`. Print the summary.

This is the last planned slice. Print a short list of what you would build next,
based on what you learned building the previous twelve, and stop.
