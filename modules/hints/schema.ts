import { z } from 'zod';

// Just-in-time hints — slice 21.
//
// Slice 20 built the path you walk on day one. This is the other half of what
// was asked for under "onboarding": a feature that explains itself the first
// time it becomes useful, rather than being narrated at an empty screen before
// there is anything to use it on.
//
// The rule that shapes everything here: **a hint is one dismissible line, shown
// on a screen that already has the data to decide whether to show it.** Slice 19
// spent a whole session taking round trips out of this app, and a hint system
// that asks the database "should I say something?" would put six of them back —
// one per screen, ~606ms each, for a sentence read once and dismissed for ever.
//
// So every predicate below is a pure function of facts the screen was already
// holding. The only thing read from the database is which hints have been
// dismissed, and that comes down with the session (`lib/session.ts`) in parallel
// with the workspace, so it costs nothing either.

/**
 * Where a hint can appear. One place, at most one hint.
 *
 * Never two lines on one screen: two things asking for attention is nothing
 * asking for attention, and this app already has a setup line on /today.
 */
export const hintPlaceSchema = z.enum(['shell', 'notes', 'note', 'course', 'tasks']);
export type HintPlace = z.infer<typeof hintPlaceSchema>;

export const hintIdSchema = z.enum(['review', 'search', 'questions', 'focus', 'tasks']);
export type HintId = z.infer<typeof hintIdSchema>;

/**
 * What a screen knows, offered to the hint that lives there.
 *
 * Every field is optional and every one of them is something the screen had
 * already fetched for its own reasons. A screen that passes nothing gets no
 * hint, which is the right answer rather than an error — a hint is the least
 * important thing on any page it appears on.
 */
export type HintFacts = {
  /** app/(app)/layout.tsx already reads this for the /review badge. */
  staleCount?: number;
  /** /notes already lists them. */
  notes?: number;
  /** /notes/[id] already has the document's blocks. */
  noteHasBody?: boolean;
  /** /courses/[id] already fetches the syllabus. */
  syllabusUnits?: number;
  /** /tasks already fetches both. */
  courses?: number;
  tasks?: number;
};

export type Hint = {
  id: HintId;
  place: HintPlace;
  /** The line. One sentence, and it says what the feature is *for*. */
  text: string;
  /**
   * Where to go, when there is somewhere to go.
   *
   * Optional, and two of the five leave it out. A hint on the screen it is
   * describing has nowhere to send you — a "Tasks" link on /tasks is furniture
   * — and `/questions` is not a route at all: questions are read on the note and
   * the course they belong to. A hint with no href is one line and Dismiss,
   * which is the honest shape when there is nothing to click.
   */
  href?: string;
  cta?: string;
};

type HintDefinition = Hint & {
  /** True when this feature has just become worth knowing about. */
  useful: (facts: HintFacts) => boolean;
};

/**
 * The five, and when each one has earned its line.
 *
 * The thresholds are the interesting part. Each one is "the feature is now
 * genuinely more useful than what you are doing instead", not "you have used the
 * app enough to deserve a tip":
 *
 *   review     the moment anything is out of date — this is the product, and the
 *              badge in the nav is a number with no explanation attached
 *   search     five notes, which is roughly where scrolling the list stops being
 *              faster than typing
 *   questions  a note with something written in it, because asking about an
 *              empty note is nothing
 *   focus      a syllabus with units, because a unit is what a session is logged
 *              against and a focus timer without one is a stopwatch
 *   tasks      a course exists, so the shorthand has a code to recognise
 */
export const HINTS: HintDefinition[] = [
  {
    id: 'review',
    place: 'shell',
    text: 'Something you wrote has changed under a summary built from it. Review shows you exactly what moved, and nothing is regenerated until you say so.',
    href: '/review',
    cta: 'See what changed',
    useful: (facts) => (facts.staleCount ?? 0) > 0,
  },
  {
    id: 'search',
    place: 'notes',
    text: 'Search reads what is inside your notes, not just their titles — and it knows which version of each it read.',
    href: '/search',
    cta: 'Try it',
    useful: (facts) => (facts.notes ?? 0) >= 5,
  },
  {
    id: 'questions',
    place: 'note',
    // Deliberately NOT "select a sentence and press ? Ask" — the note page says
    // that already, permanently, under the editor. This says the part that line
    // does not: what makes an answer here different from asking a chatbot.
    text: 'An answer you get here records which blocks it read, and which version of each — so it goes out of date when the note does, instead of quietly staying wrong.',
    // No href: `/questions` is not a route. Questions are read on the note they
    // were asked against, which is this screen, and on the course page.
    useful: (facts) => facts.noteHasBody === true,
  },
  {
    id: 'focus',
    place: 'course',
    text: 'A focus session is logged against a syllabus unit, so the minutes end up attached to the thing you were actually learning.',
    href: '/focus',
    cta: 'Start one',
    useful: (facts) => (facts.syllabusUnits ?? 0) > 0,
  },
  {
    id: 'tasks',
    place: 'tasks',
    text: 'Type a deadline the way you would say it — “MA201 problem set fri 5pm” — and the course, the date and the time are read out of it.',
    // No href: the box it is describing is on this screen, a few centimetres
    // below. A "Tasks" link on /tasks would be furniture.
    useful: (facts) => (facts.courses ?? 0) > 0,
  },
];
