# What we're building

## One sentence

A study workspace that knows when its own contents have gone out of date.

## The problem

Every AI notes tool takes a snapshot. You upload notes, it summarises them, makes
flashcards, answers your questions. Then you edit the notes — because that is what
notes are for — and everything it made for you is silently, invisibly wrong. It still
looks correct. You revise from it.

## The fix

Everything in the app is a **block** with a version number. Every AI-generated block
carries a **receipt** recording which source blocks it was built from and at which
versions. When a source block changes, its version bumps, and every derivation whose
receipt names an older version is flagged stale.

A spreadsheet has done this since 1979. No notes app does it.

## Three rules that make it work in practice

1. **Not every edit counts.** Version bumps only when the *normalised* content hash
   changes (whitespace collapsed, unicode NFKC). Fixing a typo must not trigger six
   regenerations. Get this wrong and the app is unusable by week two.
2. **Nothing regenerates silently.** Stale items go to `/review`, where the user sees
   a before/after diff and accepts. The valuable signal is not the new summary — it is
   *"your understanding of this topic just shifted."*
3. **Questions are blocks.** A question is anchored to other blocks and has a status:
   `open` → `answered` → `stale`. Its answer is a derivation like any other.

## The payoff to build toward

Once questions are first-class, unanswered questions *are* the revision list. Cross
them with minutes logged per syllabus unit and the app can answer the only question
that matters at 11pm:

> "6 questions on Unit 3 you never resolved, zero on Unit 1. You've spent 3 hours on
> Unit 1 and 20 minutes on Unit 3. Exam in 9 days."

No study app can say that today. That sentence is the product. When a design decision
is ambiguous, choose whatever gets closer to being able to say it.

## Scope boundaries — do not cross without being asked

- **Single user.** No sharing, no teams, no invites. Keep `user_id` on every row anyway.
- **No real-time collaboration.** No CRDTs, no Yjs, no presence. Blocks having stable
  ids and versions keeps that door open for later; do not walk through it now.
- **No native mobile app.** PWA only.
- **Email is read-only.** The app never sends mail. Extractions are *proposals* the
  user accepts — never written straight into the task list.
- **No billing, no landing page, no marketing site.**

## Who uses it

Aadit, a university student, on a phone at 7:45am and a laptop at 9pm. If a screen
does not work one-handed on a phone, it is not finished.
