'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import type { SaveResult } from '@/lib/timetable';
import {
  addClass,
  addPeriod,
  applyPeriodToClasses,
  removeClass,
  removePeriod,
  updateClass,
  updatePeriod,
} from '@/modules/timetable';
import { setTerm } from '@/modules/workspaces';

// Routing only, as CLAUDE.md's layout rule asks: check who is asking, hand the
// work to the module, tell the router the data moved. Every decision about what
// a class is, and every decision about which lectures may be deleted, lives in
// modules/timetable — so there is one place to read it and one place to fix it.
//
// The session is re-checked on every call. A server action is a public POST
// endpoint; the fact that the page that rendered the button was behind auth
// proves nothing about the request that arrives.
//
// Slice 19 changed two things here without changing that.
//
// One: `requireWorkspace()` replaces `getUser()` + `ensureWorkspace()`, and is
// memoised with React's `cache()`. The saving that is certain is in the render
// that follows: `refreshed()` re-renders this route, and the shell in
// app/(app)/layout.tsx and the page inside it now share one answer instead of
// asking for the same two twice — two round trips at ~606ms each. Whether the
// action's own call is shared with that render depends on Next sharing the
// request scope across the two, which is not documented either way; it is a
// bonus if it happens and costs nothing if it does not.
//
// Two: the three *class* actions return a result instead of throwing. The grid
// draws the class before the save lands, so it needs to be told when to take it
// back. The period actions below still redirect, because they are ordinary forms
// and a full page turn is the honest thing there.

async function signedIn() {
  const { workspace } = await requireWorkspace();
  return { supabase: await createClient(), workspace, workspaceId: workspace.id };
}

/**
 * Turn whatever went wrong into one sentence the grid can print.
 *
 * The message is short but it is never reassuring: a save that did not happen
 * says so. The real error still goes to the server log, where it is useful.
 */
function failed(error: unknown, doing: string): SaveResult {
  console.error(`timetable: ${doing} failed`, error);
  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, message: `${doing} did not save — ${detail}` };
}

/**
 * The timetable is the shape of the term, so a change to it shows up on the
 * calendar and on today's page as well as here.
 *
 * `/timetable` first and deliberately: revalidating the path the request came
 * from is what makes the fresh grid part of *this* POST's response, which is
 * what lets the optimistic block hand over to the real one without a flicker.
 * The other four are cache invalidations for screens nobody is looking at yet.
 */
function refreshed() {
  revalidatePath('/timetable');
  revalidatePath('/timetable/periods');
  revalidatePath('/calendar');
  revalidatePath('/today');
  revalidatePath('/courses');
}

export async function addClassAction(values: {
  periodId: string;
  weekday: number;
  courseId: string | null;
  newCourse: { code: string; name: string; colour: string } | null;
  room: string;
  isLab: boolean;
}): Promise<SaveResult> {
  try {
    const { supabase, workspace } = await signedIn();

    await addClass(
      supabase,
      {
        workspaceId: workspace.id,
        periodId: values.periodId,
        weekday: values.weekday,
        room: values.room,
        isLab: values.isLab,
        ...(values.courseId
          ? { courseId: values.courseId }
          : { newCourse: values.newCourse ?? undefined }),
        timeZone: localTimeZone(),
      },
      // The workspace this action already read, so generating the rest of term
      // does not fetch the same row again.
      workspace
    );

    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'The class');
  }
}

export async function updateClassAction(values: {
  sessionId: string;
  room: string;
  isLab: boolean;
  courseId: string | null;
}): Promise<SaveResult> {
  try {
    const { supabase, workspace } = await signedIn();

    await updateClass(
      supabase,
      {
        workspaceId: workspace.id,
        sessionId: values.sessionId,
        room: values.room,
        isLab: values.isLab,
        ...(values.courseId ? { courseId: values.courseId } : {}),
        timeZone: localTimeZone(),
      },
      workspace
    );

    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'The change');
  }
}

export async function removeClassAction(sessionId: string): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await removeClass(supabase, workspaceId, sessionId);
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'Removing the class');
  }
}

// ---------------------------------------------------------------------------
// The grid's own rows — slice 17
//
// Editing a period is deliberately two separate presses. Save changes the row
// heading and nothing dated; "Apply to N classes" is the one that moves
// lectures, and it only ever moves future untouched ones. See
// modules/timetable/service.ts, and period-edits.test.ts for the proof.
// ---------------------------------------------------------------------------

/** Save a row's label and times. Touches no lecture and no weekly slot. */
export async function updatePeriodAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await updatePeriod(supabase, {
    workspaceId,
    periodId: String(formData.get('periodId') ?? ''),
    label: String(formData.get('label') ?? ''),
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
  });

  refreshed();
  redirect('/timetable/periods');
}

/** The spare "+1" row at the foot of the printed timetable, and any after it. */
export async function addPeriodAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await addPeriod(supabase, {
    workspaceId,
    label: String(formData.get('label') ?? ''),
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
  });

  refreshed();
  redirect('/timetable/periods');
}

/** Drop a row. The classes on it keep their own times and stay on the calendar. */
export async function removePeriodAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await removePeriod(supabase, workspaceId, String(formData.get('periodId') ?? ''));
  refreshed();
  redirect('/timetable/periods');
}

/**
 * The explicit one: move the classes on this row onto its corrected times.
 *
 * Only the classes filed under the row, only the remaining lectures of this
 * term, and never a lecture that carries a note, a topic, a unit or a
 * cancellation.
 */
export async function applyPeriodAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId, workspace } = await signedIn();

  const result = await applyPeriodToClasses(
    supabase,
    workspaceId,
    String(formData.get('periodId') ?? ''),
    localTimeZone(),
    workspace
  );

  refreshed();
  redirect(
    `/timetable/periods?applied=${result.classes}&moved=${result.generated?.updated ?? 0}`
  );
}

/**
 * When the term runs. Two dates, saved on the workspace, and from then on
 * "generate the rest of term" needs no form at all.
 */
export async function setTermAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const termStart = String(formData.get('termStart') ?? '').trim();
  const termEnd = String(formData.get('termEnd') ?? '').trim();

  if (!termStart && !termEnd) {
    await setTerm(supabase, workspaceId, { termStart: null, termEnd: null });
    refreshed();
    redirect('/timetable');
  }

  if (!termStart || !termEnd) {
    redirect('/timetable?error=Pick+both+a+start+and+an+end+date.');
  }
  if (termEnd < termStart) {
    redirect('/timetable?error=The+term+ends+before+it+starts.');
  }

  await setTerm(supabase, workspaceId, { termStart, termEnd });
  refreshed();
  redirect('/timetable');
}
