'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createStandaloneNote, getStandaloneNote, saveNoteDocument } from '@/modules/notes';
import { createTask } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only: check who is asking, hand the work to the module, tell the
// router what moved. No SQL and no rules about documents live here.
//
// The session is re-checked on every call. A server action is a public POST
// endpoint; the fact that the page that rendered the editor was behind auth
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
 * Autosave. Called every second or so while typing, so it revalidates
 * nothing: the note list shows titles and dates, and neither of them moves
 * when a paragraph does.
 */
export async function saveNoteAction(
  docId: string | null,
  nodes: unknown[]
): Promise<{ docId: string }> {
  // A note opened at /notes/[id] already exists, so it always has an id. The
  // nullable argument is the editor's shape, not this action's.
  if (docId === null) throw new Error('saveNoteAction: no note to save into');

  const { supabase, workspaceId } = await signedIn();
  await saveNoteDocument(supabase, workspaceId, docId, { nodes });
  return { docId };
}

/**
 * A task made by selecting a sentence in a free-standing note.
 *
 * The note is read back from the database first, so the course the task is
 * filed under is the one the note itself carries rather than anything the
 * browser said. `sourceBlockId` is the one client-supplied id that reaches the
 * task, and modules/tasks proves it belongs to this workspace before writing.
 */
export async function addNoteTaskAction(
  docId: string,
  input: { title: string; sourceBlockId: string | null; dueAt: string | null }
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const note = await getStandaloneNote(supabase, workspaceId, docId);

  await createTask(supabase, {
    workspaceId,
    title: input.title,
    courseId: note?.course_id ?? null,
    unitId: note?.course_id ? note.unit_id : null,
    dueAt: input.dueAt,
    sourceBlockId: input.sourceBlockId,
  });

  revalidatePath(`/notes/${docId}`);
  revalidatePath('/tasks');
  revalidatePath('/today');
  revalidatePath('/calendar');
}

/** A note with no lecture behind it. Lands straight in the editor. */
export async function createStandaloneNoteAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const unitId = String(formData.get('unitId') ?? '');

  const docId = await createStandaloneNote(supabase, {
    workspaceId,
    title: String(formData.get('title') ?? ''),
    courseId: String(formData.get('courseId') ?? ''),
    unitId: unitId === '' ? null : unitId,
  });

  revalidatePath('/notes');
  redirect(`/notes/${docId}`);
}
