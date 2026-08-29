'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import {
  addClass,
  addPeriod,
  applyPeriodToClasses,
  removeClass,
  removePeriod,
  updateClass,
  updatePeriod,
} from '@/modules/timetable';
import { ensureWorkspace, setTerm } from '@/modules/workspaces';

// Routing only, as CLAUDE.md's layout rule asks: check who is asking, hand the
// work to the module, tell the router the data moved. Every decision about what
// a class is, and every decision about which lectures may be deleted, lives in
// modules/timetable — so there is one place to read it and one place to fix it.
//
// The session is re-checked on every call. A server action is a public POST
// endpoint; the fact that the page that rendered the button was behind auth
// proves nothing about the request that arrives.

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const workspace = await ensureWorkspace(supabase, user.id);
  return { supabase, workspaceId: workspace.id };
}

/**
 * The timetable is the shape of the term, so a change to it shows up on the
 * calendar and on today's page as well as here.
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
}): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await addClass(supabase, {
    workspaceId,
    periodId: values.periodId,
    weekday: values.weekday,
    room: values.room,
    isLab: values.isLab,
    ...(values.courseId
      ? { courseId: values.courseId }
      : { newCourse: values.newCourse ?? undefined }),
    timeZone: localTimeZone(),
  });

  refreshed();
}

export async function updateClassAction(values: {
  sessionId: string;
  room: string;
  isLab: boolean;
  courseId: string | null;
}): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await updateClass(supabase, {
    workspaceId,
    sessionId: values.sessionId,
    room: values.room,
    isLab: values.isLab,
    ...(values.courseId ? { courseId: values.courseId } : {}),
    timeZone: localTimeZone(),
  });

  refreshed();
}

export async function removeClassAction(sessionId: string): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await removeClass(supabase, workspaceId, sessionId);
  refreshed();
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
  const { supabase, workspaceId } = await signedIn();

  const result = await applyPeriodToClasses(
    supabase,
    workspaceId,
    String(formData.get('periodId') ?? ''),
    localTimeZone()
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
