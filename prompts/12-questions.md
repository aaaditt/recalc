# Slice 12 — Questions

Read `CLAUDE.md` and `docs/PRODUCT.md` first. Slice 11 must be working before this
one starts. **This slice delivers the payoff the product was designed around** — read
the "payoff to build toward" section of PRODUCT.md again before you begin.

## Goal

My unanswered questions become my revision list.

## Build

1. **Ask about a selection** — highlight text in a note, hit ask, type a question.
   Creates a `question` block anchored to the selected blocks, status `open`.

2. **Answering** — the answer is a derivation (`recipe: 'answer'`) whose sources are
   the anchored blocks plus the question. Reuse the slice 11 worker; do not write a
   second engine. When the anchored blocks change, the answer goes stale exactly like
   a summary — it lands in `/review` labelled as an answer to a question.

3. **Question lifecycle** — `open` → `answered` → `resolved`. I mark resolved myself
   when I actually understand it. An answered-but-not-resolved question is still an
   open loop and must still show up.

4. **`/courses/[id]` gets an Open Questions section** — unresolved questions grouped
   by syllabus unit, showing the count per unit.

5. **The sentence** — on the course page, render the line PRODUCT.md is built around,
   from real data:
   > "6 questions on Unit 3 you never resolved, zero on Unit 1. You've spent 3 hours
   > on Unit 1 and 20 minutes on Unit 3."
   Combine unresolved question counts per unit with minutes from `modules/study`.
   If an exam date is known, include days remaining. Write it as plain prose, one or
   two sentences. No chart, no gauge, no score.

6. **Test** — editing a block that a question is anchored to marks its answer stale.

## Constraints

- Reuse the recalc engine. If you find yourself writing new derivation-running code,
  stop and reuse slice 11.
- The answer must cite which of my own blocks it drew from, and link to them.
- Do not invent a "confidence score" or any other fake metric.

## Definition of done

I will: ask three real questions during a lecture, answer them, edit one of the source
notes, and see the corresponding answer flagged. Then open the course page and see an
honest sentence about which units I am weakest on.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
