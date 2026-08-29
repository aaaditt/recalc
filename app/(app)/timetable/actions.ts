'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import { addClass, removeClass, updateClass } from '@/modules/timetable';
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
