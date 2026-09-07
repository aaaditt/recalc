import type { SupabaseClient } from '@supabase/supabase-js';

import { hasAgentRole } from '@/modules/agents';
import { countBlocks } from '@/modules/blocks';
import { getCourses, getSessionsInWorkspace } from '@/modules/courses';
import { isOnboardingDismissed, setOnboardingDismissed } from '@/modules/profiles';
import { countSummaries, countSummariesEverStale } from '@/modules/recalc';
import { getWorkspace } from '@/modules/workspaces';

import { STEPS, type Progress, type Step, type StepId, type StepState } from './schema';

// Where somebody is in the guided setup path.
//
// This module owns no table. Every answer below is computed from data that
// already exists somewhere else, and that is the design rather than an economy:
// a stored "step 3 is done" can disagree with the world, and this cannot.
// Deleting your only course un-ticks step 2, correctly, and there is no repair
// job to write because there is nothing to repair.
//
// Everything is read in ONE `Promise.all`. Seven questions asked in sequence
// against a database ~606ms away is four seconds to draw a checklist; asked
// together it is one round trip. Slice 19 is the reason that sentence is in this
// file at all.

/** What each step needs to be true, gathered once. */
type Facts = {
  termSet: boolean;
  courses: number;
  sessions: number;
  notes: number;
  hasDeepRole: boolean;
  summaries: number;
  summariesEverStale: number;
  dismissed: boolean;
};

/**
 * Whether each step is done, given the facts.
 *
 * Split out from the fetching so the rules can be read on one screen, and so
 * that the thing worth arguing about — step 7 — is arguable in one place.
 */
function isDone(id: StepId, facts: Facts): boolean {
  switch (id) {
    case 'term':
      return facts.termSet;
    case 'course':
      return facts.courses > 0;
    case 'timetable':
      return facts.sessions > 0;
    case 'note':
      return facts.notes > 0;
    case 'model':
      return facts.hasDeepRole;
    case 'summarise':
      return facts.summaries > 0;

    // ---------------------------------------------------------------------
    // THE ONE THAT MATTERS. Read migration 015 before changing this line.
    //
    // "A summary in this workspace has gone stale at least once." Not "something
    // is stale now" — that un-ticks the moment the user accepts the diff in
    // /review, punishing them for doing the thing the step taught. And not
    // "a source block has version > 1", which is already true before anything is
    // summarised, because the editor autosaves a second after the last keystroke
    // and a note written in two sittings is at version 2 on its own.
    //
    // `stale_runs` counts fresh->stale transitions and only ever increases, so
    // this ticks exactly when the lesson lands and never comes undone.
    // ---------------------------------------------------------------------
    case 'stale':
      return facts.summariesEverStale > 0;
  }
}

/**
 * Three states, not two.
 *
 * `blocked` is what Act 2 reports with no `deep` role configured: not "you have
 * not done this yet" but "you cannot do this from here yet". The screen says
 * what is missing instead of offering a button that goes nowhere.
 *
 * "Add a model" is never blocked — it is the thing that unblocks the rest.
 */
function stateOf(id: StepId, facts: Facts): StepState {
  if (isDone(id, facts)) return 'done';
  const step = STEPS.find((candidate) => candidate.id === id);
  if (step?.act === 2 && id !== 'model' && !facts.hasDeepRole) return 'blocked';
  return 'todo';
}

/**
 * The whole path, answered.
 *
 * `summarising` asks for the `deep` role and not `fast`, because that is the
 * role `modules/recalc/recipes/summarize.ts` asks for. `/today`'s existing
 * agents strip checks `fast`; that inconsistency predates this slice and is
 * left alone deliberately.
 */
export async function getProgress(
  db: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<Progress> {
  const [workspace, courses, sessions, notes, hasDeepRole, summaries, everStale, dismissed] =
    await Promise.all([
      getWorkspace(db, workspaceId),
      getCourses(db, workspaceId),
      getSessionsInWorkspace(db, workspaceId),
      countBlocks(db, workspaceId, 'note'),
      hasAgentRole(db, userId, 'deep'),
      countSummaries(db, workspaceId),
      countSummariesEverStale(db, workspaceId),
      isOnboardingDismissed(db, userId),
    ]);

  const facts: Facts = {
    termSet: Boolean(workspace?.term_start && workspace?.term_end),
    courses: courses.length,
    sessions: sessions.length,
    notes,
    hasDeepRole,
    summaries,
    summariesEverStale: everStale,
    dismissed,
  };

  const steps: Step[] = STEPS.map((step) => ({ ...step, state: stateOf(step.id, facts) }));

  // The first step not yet done is the one `/start` draws. A blocked step still
  // counts as "where you are": being told that Act 2 needs a key is more use
  // than being silently skipped past it to a step you also cannot do.
  const current = steps.find((step) => step.state !== 'done') ?? null;

  return {
    steps,
    current,
    doneCount: steps.filter((step) => step.state === 'done').length,
    actOneComplete: steps
      .filter((step) => step.act === 1)
      .every((step) => step.state === 'done'),
    complete: steps.every((step) => step.state === 'done'),
    dismissed: facts.dismissed,
  };
}

/**
 * Should `/today` show its one quiet line?
 *
 * Act 1 rather than the whole path, because Act 2 needs a key some people will
 * never want, and a line that never goes away is a line that gets ignored —
 * taking the rest of the screen's credibility with it. Same reasoning as the
 * setup card this replaces (docs/DECISIONS.md, slice 18).
 */
export function shouldOfferSetup(progress: Progress): boolean {
  return !progress.dismissed && !progress.actOneComplete;
}

/** Put the path away, or bring it back. The only thing here that writes. */
export async function dismiss(db: SupabaseClient, userId: string): Promise<void> {
  await setOnboardingDismissed(db, userId, true);
}

export async function restore(db: SupabaseClient, userId: string): Promise<void> {
  await setOnboardingDismissed(db, userId, false);
}
