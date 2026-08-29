'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createCourse, getCourses, updateCourse } from '@/modules/courses';
import { removeCourse } from '@/modules/timetable';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only, as CLAUDE.md's layout rule asks: check who is asking, hand the
// work to the module, tell the router the data moved. Whether a course may be
// deleted is decided in modules/timetable — it needs notes, files and tasks to
// answer — and nothing about that judgement is repeated here.
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

/** A course's code and colour are drawn on nearly every screen in the app. */
function refreshed(courseId?: string) {
  revalidatePath('/courses');
  if (courseId) {
    revalidatePath(`/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/settings`);
  }
  revalidatePath('/timetable');
  revalidatePath('/calendar');
  revalidatePath('/today');
  revalidatePath('/tasks');
  revalidatePath('/notes');
}

/** An empty credits box means "not recorded", which is not the same as zero. */
function creditsFrom(formData: FormData): number | null {
  const raw = String(formData.get('credits') ?? '').trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Add a course without first inventing a slot for it on the timetable.
 *
 * The fast path is still the grid — click a cell, type the code — but a course
 * with no weekly class at all (a project, a reading course) has to be possible
 * or the syllabus and the notes have nowhere to hang.
 */
export async function addCourseAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const existing = await getCourses(supabase, workspaceId);
  const term = String(formData.get('term') ?? '').trim() || existing[0]?.term || 'This term';

  const course = await createCourse(supabase, {
    workspaceId,
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    term,
    colour: String(formData.get('colour') ?? '').trim() || null,
  });

  refreshed(course.id);
  redirect(`/courses/${course.id}/settings`);
}

/** The whole settings form, posted back at once. */
export async function updateCourseAction(
  courseId: string,
  formData: FormData
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await updateCourse(supabase, workspaceId, courseId, {
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    term: String(formData.get('term') ?? ''),
    colour: String(formData.get('colour') ?? '').trim() || null,
    instructor: String(formData.get('instructor') ?? ''),
    credits: creditsFrom(formData),
  });

  refreshed(courseId);
  redirect(`/courses/${courseId}/settings?saved=1`);
}

/**
 * Delete a course — which modules/timetable refuses the moment anything is
 * written against it, because `courses` cascades to its lectures and a lecture
 * is what a note hangs off.
 *
 * A refusal comes back as counts rather than an exception, so the screen can
 * say what is in the way instead of "no".
 */
export async function removeCourseAction(courseId: string): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const result = await removeCourse(supabase, workspaceId, courseId);
  refreshed(courseId);

  if (result.removed) redirect('/courses');

  const kept = [
    result.notes > 0 ? `${result.notes} note${result.notes === 1 ? '' : 's'}` : null,
    result.lecturesWithWork > 0
      ? `${result.lecturesWithWork} lecture${result.lecturesWithWork === 1 ? '' : 's'} you have edited`
      : null,
    result.files > 0 ? `${result.files} file${result.files === 1 ? '' : 's'}` : null,
    result.tasks > 0 ? `${result.tasks} task${result.tasks === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  redirect(
    `/courses/${courseId}/settings?kept=${encodeURIComponent(kept)}`
  );
}
