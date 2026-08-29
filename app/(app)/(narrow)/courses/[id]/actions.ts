'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  createSyllabusUnit,
  moveSyllabusUnit,
  removeSyllabusUnit,
  renameSyllabusUnit,
  setSyllabusUnitStatus,
  type SyllabusUnitStatus,
  type UnitMove,
} from '@/modules/courses';
import { createStandaloneNote } from '@/modules/notes';
import { createTask } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only, as CLAUDE.md's layout rule asks: check who is asking, hand the
// work to the module, tell the router the data moved. No SQL and no rules about
// syllabus units live here — in particular, every check that a courseId or a
// unitId belongs to this workspace is inside modules/courses, so a second
// caller cannot forget it.
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
 * A syllabus unit is named on five screens — the course page, the lecture
 * page's topic picker, the focus timer's unit picker, the task edit sheet and
 * the new-note form — so a change to one shows up on all of them.
 */
function refreshed(courseId: string) {
  revalidatePath(`/courses/${courseId}`);
  revalidatePath('/courses');
  revalidatePath('/focus');
  revalidatePath('/tasks');
  revalidatePath('/notes');
}

/** The add box at the foot of the syllabus: type, enter, type, enter. */
export async function addUnitAction(courseId: string, title: string): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await createSyllabusUnit(supabase, { workspaceId, courseId, title });
  refreshed(courseId);
}

/** Inline rename. Called on blur or Enter, and only when the title changed. */
export async function renameUnitAction(
  courseId: string,
  unitId: string,
  title: string
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await renameSyllabusUnit(supabase, workspaceId, unitId, title);
  refreshed(courseId);
}

/**
 * One plain `<form>` per row with four submit buttons: the status chip, the two
 * arrows and remove. No JavaScript is involved in any of them.
 *
 * Only the clicked button's name and value are posted, so a move, a status
 * change and a deletion can never be confused with one another.
 */
export async function unitRowAction(courseId: string, formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const unitId = String(formData.get('unitId') ?? '');
  const move = String(formData.get('move') ?? '');

  if (move === 'up' || move === 'down') {
    await moveSyllabusUnit(supabase, workspaceId, unitId, move as UnitMove);
  } else if (formData.get('remove') !== null) {
    // Safe to be destructive about: every foreign key pointing at a unit is
    // `on delete set null`, so a lecture that covered it keeps its note and a
    // task set on it keeps its title. What goes is the filing, not the writing.
    await removeSyllabusUnit(supabase, workspaceId, unitId);
  } else {
    // The next status along is computed in the browser by lib/syllabus's
    // `nextUnitStatus` and posted, so the button's label and what it does can
    // never disagree. The module validates it against the enum regardless.
    await setSyllabusUnitStatus(
      supabase,
      workspaceId,
      unitId,
      String(formData.get('status') ?? '') as SyllabusUnitStatus
    );
  }

  refreshed(courseId);
}

/**
 * Attach something new to a unit — the other half of "a note or a task can be
 * attached to a unit from either side". The course and the unit are both
 * re-checked inside the modules before anything is written.
 */
export async function addUnitTaskAction(
  courseId: string,
  formData: FormData
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const title = String(formData.get('title') ?? '').trim();
  if (title === '') return;

  await createTask(supabase, {
    workspaceId,
    title,
    courseId,
    unitId: String(formData.get('unitId') ?? ''),
  });

  refreshed(courseId);
  revalidatePath('/today');
  revalidatePath('/calendar');
}

/** The same, for a free-standing note. Lands straight in the editor. */
export async function addUnitNoteAction(
  courseId: string,
  formData: FormData
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const docId = await createStandaloneNote(supabase, {
    workspaceId,
    title: String(formData.get('title') ?? ''),
    courseId,
    unitId: String(formData.get('unitId') ?? ''),
  });

  refreshed(courseId);
  redirect(`/notes/${docId}`);
}
