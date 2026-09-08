import { z } from 'zod';

// The guided setup path, as data — slice 20.
//
// Seven steps in two acts, and the copy for each lives here rather than in the
// component, because what a step *is* (its order, its prerequisite, the sentence
// explaining why it is worth doing) is a product decision and not a rendering
// one. `components/onboarding/guided-step.tsx` takes strings and booleans and
// draws them, exactly like every other component in this project.
//
// This module owns no table. Every tick is computed in service.ts from data
// that already exists somewhere else, which is why it cannot lie about your
// progress and why deleting your only course correctly un-ticks step 2.

/**
 * Which half of the path a step belongs to.
 *
 * The split is a prerequisite, not a judgement of importance. Act 2 needs an API
 * key from a provider, which costs money and which some people will never want;
 * Act 1 needs nothing but typing. Calling Act 2 "optional" would be wrong,
 * because every step here is optional.
 */
export const actSchema = z.union([z.literal(1), z.literal(2)]);
export type Act = z.infer<typeof actSchema>;

/**
 * What a step reports. Three states, not a boolean.
 *
 * `blocked` is the one that earns its keep: an Act 2 step with no `deep` role
 * configured is not "not done yet", it is "you cannot do this from here". The
 * screen says what is missing instead of offering a button that goes nowhere.
 */
export const stepStateSchema = z.enum(['done', 'todo', 'blocked']);
export type StepState = z.infer<typeof stepStateSchema>;

export const stepIdSchema = z.enum([
  'term',
  'course',
  'timetable',
  'note',
  'model',
  'summarise',
  'stale',
]);
export type StepId = z.infer<typeof stepIdSchema>;

/** One step, before its state is known. */
export type StepDefinition = {
  id: StepId;
  act: Act;
  title: string;
  /** One sentence under the title, saying why this is worth doing. */
  why: string;
  /** Where the real thing is done. Never a screen invented for the tour. */
  href: string;
  cta: string;
};

/** One step, with the answer. */
export type Step = StepDefinition & { state: StepState };

/** The whole path, and where in it the user is. */
export type Progress = {
  steps: Step[];
  /** The first step not yet done — the one `/start` renders. Null when finished. */
  current: Step | null;
  doneCount: number;
  /** Act 1 complete. What `/today`'s quiet line disappears on. */
  actOneComplete: boolean;
  /** Every step done, in both acts. */
  complete: boolean;
  /** They pressed "I am done with this". */
  dismissed: boolean;
};

/**
 * The steps, in the order they depend on each other.
 *
 * Every `href` is a screen that existed before this slice. That is the design:
 * the path teaches by sending you to do the real thing on the real screen, and
 * the app fills with your own data as you go. There is no tour, no spotlight and
 * no screen here that exists only to be onboarded through — three separate
 * "not a modal, not a wizard" decisions in this codebase say so.
 */
export const STEPS: StepDefinition[] = [
  {
    id: 'term',
    act: 1,
    title: 'Say when term runs',
    why: 'Two dates. Adding a class then knows how far to expand itself.',
    href: '/timetable',
    cta: 'Set the dates',
  },
  {
    id: 'course',
    act: 1,
    title: 'Add your first course',
    why: 'Everything hangs off a course — notes, deadlines, the questions you never got round to.',
    href: '/courses',
    cta: 'Add a course',
  },
  {
    id: 'timetable',
    act: 1,
    title: 'Put it on the timetable',
    why: 'Click the cell where it sits. Your lectures get made for the whole term.',
    href: '/timetable',
    cta: 'Open the grid',
  },
  {
    id: 'note',
    act: 1,
    title: 'Write your first note',
    why: 'Attached to a lecture, so it knows which class it came from.',
    href: '/notes',
    cta: 'Write a note',
  },
  {
    id: 'model',
    act: 2,
    title: 'Add a model',
    why: 'Your own key, your own provider. Summaries and answers need one.',
    href: '/settings/agents',
    cta: 'Paste a key',
  },
  {
    id: 'summarise',
    act: 2,
    title: 'Summarise that note',
    why: 'The summary records which blocks it read, and which version of each.',
    href: '/notes',
    cta: 'Open the note',
  },
  {
    id: 'stale',
    act: 2,
    title: 'Edit it, and watch it go stale',
    why: 'This is the whole point. Change the note and the summary knows it is out of date.',
    href: '/notes',
    cta: 'Edit the note',
  },
];

/** The line that introduces Act 2, stated as the prerequisite it is. */
export const ACT_TWO_PREAMBLE =
  'This part needs an API key from a provider. It costs money, it is yours ' +
  'rather than ours, and skipping it leaves you with a working app.';

/**
 * This path's id in `profiles.dismissed_notices`.
 *
 * Slice 21 gave every "I have seen this" in the app one home, and the guided
 * path is one entry in it. The id is owned here rather than in
 * `modules/profiles`, which stores notices without knowing what any of them
 * mean, and rather than in `modules/hints`, which would make onboarding depend
 * on a module that does not exist for it.
 */
export const SETUP_NOTICE = 'setup';
