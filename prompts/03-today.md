# Slice 03 — Today

Read `CLAUDE.md`, `docs/PRODUCT.md` and `docs/DESIGN.md` first. Slice 02 must be done —
use its tokens and primitives, do not invent new ones.

## Goal

The page I open at 7:45am on my phone. Read-only. This is the page that decides
whether I keep using this app, so it has to be genuinely good.

## Build

1. **`/today`** as a Server Component reading through `modules/courses` and
   `modules/tasks`:
   - today's classes from `class_meetings`: time, subject code, course name, room —
     in order, with the current or next class visually distinct, using the course
     rail-and-tint treatment from DESIGN.md
   - tasks due in the next 7 days, grouped by day, overdue ones first and marked
   - nothing else. No widgets, no stats, no empty-state clutter.

2. **App shell** — a minimal layout with bottom navigation on mobile
   (Today · Calendar · Notes · Review) and a sidebar on desktop. Only Today works
   for now; the rest are placeholders that say so honestly.

3. **PWA basics** — `manifest.json`, icons, correct viewport meta, theme colour.
   Installable to the iOS/Android home screen and opening fullscreen.

4. **Empty states** that tell me what to do, not just "no data".

5. **Deploy to Vercel** — connect the repo, set the env vars, confirm the live URL
   works and that I can log in there.

## Constraints

- Mobile-first. Design at 390px wide, then let it breathe on desktop.
- Must be usable one-handed.
- Server Components except where interaction genuinely requires otherwise.
- No loading spinners on the main content — this page must feel instant.

## Definition of done

I will: open the live Vercel URL on my phone, add it to my home screen, open it from
the icon, and see my real classes for today and my real deadlines this week.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
