'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { setMeetingUnit } from '@/modules/courses';
import { ensureLectureNote, saveNoteDocument } from '@/modules/notes';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only. Same shape as the calendar's actions: who is asking, hand it
// to the module, say what moved.

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
 * Autosave for a lecture's note.
 *
 * `docId` is null until the first save, which is when the note document is
 * created and attached to the lecture. Creating it here rather than while the
 * page renders means hovering a lecture on the calendar — which prefetches the
 * page — never leaves an empty note behind.
 */
export async function saveLectureNoteAction(
  meetingId: string,
  docId: string | null,
  nodes: unknown[]
): Promise<{ docId: string }> {
  const { supabase, workspaceId } = await signedIn();

  const id = docId ?? (await ensureLectureNote(supabase, workspaceId, meetingId));
  await saveNoteDocument(supabase, workspaceId, id, { nodes });

  // Only the first save changes anything a list is showing: the lecture now
  // has a note, so it appears in /notes.
  if (docId === null) revalidatePath('/notes');

  return { docId: id };
}

/** One tap: which syllabus unit this lecture covered. Empty clears it. */
export async function setLectureUnitAction(
  meetingId: string,
  formData: FormData
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const unitId = String(formData.get('unitId') ?? '');
  await setMeetingUnit(supabase, workspaceId, meetingId, unitId === '' ? null : unitId);

  revalidatePath(`/lecture/${meetingId}`);
}
