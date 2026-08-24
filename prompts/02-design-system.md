# Slice 02 — Design system

Read `CLAUDE.md` and **all of `docs/DESIGN.md`** before writing anything.

## Goal

The tokens and primitives every later screen is built from. Small slice, half an hour,
and it is the reason sixteen sessions of work will look like one app.

## Build

1. **Tokens** — colours, type scale, spacing, radii from DESIGN.md, as CSS custom
   properties on `:root` with a dark-mode block that redefines only the tokens.
   Wire them into the Tailwind theme so components use `bg-surface`, `text-muted`
   etc. rather than raw hex anywhere.

2. **Fonts** — Geist Sans and Geist Mono via `next/font`, Source Serif 4 for note
   content. Set `font-variant-numeric: tabular-nums` globally on anything showing
   times, dates, durations or counts.

3. **Course colours** — the eight from DESIGN.md as a named palette, with helpers:
   `courseRail(colour)`, `courseTint(colour)`, `courseDot(colour)`. These three are
   the *only* sanctioned ways to apply a course colour. Do not let later slices
   invent their own.

4. **Primitives** in `/components/ui`: Button, Card, Sheet (bottom sheet on mobile,
   side panel on desktop), Pill, EmptyState, PageHeader. Small, unstyled-by-default,
   composable. No component library — these are twenty lines each.

5. **`/styleguide`** — a dev-only page rendering every token, every primitive, both
   themes, and a sample class block in all eight course colours. This is how I check
   the system without building a screen, and how later sessions see what already
   exists instead of reinventing it.

## Constraints

- No screens, no data, no business logic in this slice.
- Do not install a UI kit. Not shadcn, not Radix wholesale, not MUI. Small primitives
  we own.
- Every colour must be a token. If a hex code appears outside the token file, it is
  a bug.

## Definition of done

I will: open `/styleguide` on my phone and my laptop, toggle dark mode, and see the
eight course colours all legible as rails and tints — and confirm the sample class
block looks calm rather than garish.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
