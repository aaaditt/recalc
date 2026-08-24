# Slice 05 — Notes

Read `CLAUDE.md`, `docs/SCHEMA.md` (especially the normalisation rule) and the
"lecture page" section of `docs/DESIGN.md` first.

## Goal

I can tap a lecture in the calendar and take notes on it, and every paragraph is
persisted as a block with correct versioning. This is the slice the whole engine
depends on.

## Build

1. **TipTap editor** at `/notes/[id]`, with a document being a parent block and each
   top-level node a child block. Support: paragraphs, headings, bullet and numbered
   lists, bold/italic, code, and a divider. Nothing more.

2. **Block-level persistence** — each top-level node saves as its own `blocks` row
   with a stable id carried in the node's attributes. New node → new block. Deleted
   node → soft delete. Reordering → `position` change only, **no version bump**.

3. **Autosave**, debounced, going through `blocks.service.updateBlock` so hashing and
   version bumping stay correct. Show a small, quiet saved/saving indicator.

4. **The lecture page** at `/lecture/[meetingId]`, built to the DESIGN.md spec:
   header with subject code, course, date, time, room; then the note for that lecture,
   created on first open and stored as `class_meetings.note_block_id`. Opening
   *tomorrow's* lecture and starting the note before class must work.
   Leave clearly-labelled empty sections for files (slice 09) and questions (slice 12)
   so later slices have a home to slot into.

5. **One-tap topic** — set which syllabus unit this lecture covered, from the lecture
   page. This single link is what makes the study analytics in slice 12 possible, so
   make it fast and obvious.

6. **Notes list** at `/notes` grouped by course, newest first. Lecture notes show
   their date and subject code. A free-standing note (not tied to a lecture) is also
   allowed, linked to a course and optionally a unit.

7. **Tests** in `modules/blocks/`:
   - reordering blocks does not bump any version
   - a formatting-only change (bold applied, whitespace altered) does not bump
   - a real word change does bump
   - deleting a node soft-deletes rather than removing the row

## Constraints

- Do not build a custom editor. TipTap only.
- Do not add collaborative editing, comments, or presence.
- Typing must stay smooth — debounce writes, never save on every keystroke.

## Definition of done

I will: open tomorrow's lecture from the calendar, start a note before class, take
notes through the actual lecture, reorder a few paragraphs, fix a typo,
then check in Supabase that the reordered blocks kept their version numbers and only
the genuinely-edited paragraph incremented.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
