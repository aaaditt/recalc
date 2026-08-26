'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { getMeeting, setMeetingUnit } from '@/modules/courses';
import {
  attachDriveFiles,
  courseCodeForMeeting,
  removeFile,
  saveNoteImage,
} from '@/modules/files';
import { ensureRecalcFolder, getDriveAccessToken } from '@/modules/google';
import { ensureLectureNote, saveNoteDocument } from '@/modules/notes';
import { createTask } from '@/modules/tasks';
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
  return { supabase, workspaceId: workspace.id, userId: user.id };
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

/**
 * A task made by selecting a sentence in this lecture's note.
 *
 * `meetingId` is read back from the database before anything is written, and
 * the course comes from the row that comes back rather than from the browser —
 * so the only client-supplied id that reaches the task is `sourceBlockId`, and
 * modules/tasks proves that one belongs to this workspace before inserting.
 */
export async function addLectureTaskAction(
  meetingId: string,
  input: { title: string; sourceBlockId: string | null; dueAt: string | null }
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const meeting = await getMeeting(supabase, workspaceId, meetingId);
  if (!meeting) throw new Error(`addLectureTaskAction: no lecture ${meetingId} here`);

  await createTask(supabase, {
    workspaceId,
    title: input.title,
    courseId: meeting.course_id,
    unitId: meeting.unit_id,
    meetingId: meeting.id,
    dueAt: input.dueAt,
    sourceBlockId: input.sourceBlockId,
  });

  revalidatePath(`/lecture/${meetingId}`);
  revalidatePath('/tasks');
  revalidatePath('/today');
  revalidatePath('/calendar');
}

// ---------------------------------------------------------------------------
// Files
//
// `meetingId` is bound to the action by the page, but it still arrives from the
// browser on the way back, so every one of these hands it to modules/files (or
// modules/courses) to be proved against this workspace before anything is
// written. That is the pattern slices 04–08 arrived at the hard way; see
// docs/DECISIONS.md.
// ---------------------------------------------------------------------------

/**
 * Mint a Drive token and make sure `Recalc/<course code>/` exists.
 *
 * The course code is read from the lecture's own row, never from the browser,
 * so a caller cannot aim an upload at another course's folder.
 *
 * This is the one place a Google token is handed to the client. It is scoped to
 * `drive.file` alone, lives about an hour, and is what makes the Picker — and
 * uploading a 40MB deck without it passing through this server — possible.
 */
export async function prepareDriveUploadAction(meetingId: string): Promise<{
  accessToken: string;
  appId: string;
  folderId: string;
  folderPath: string;
}> {
  const { supabase, workspaceId, userId } = await signedIn();

  const code = await courseCodeForMeeting(supabase, workspaceId, meetingId);
  const folder = await ensureRecalcFolder(supabase, userId, code);

  return {
    accessToken: await getDriveAccessToken(supabase, userId),
    // The Cloud project number, which the Picker wants. It is the first part of
    // the OAuth client id and is not a secret.
    appId: (process.env.GOOGLE_CLIENT_ID ?? '').split('-')[0],
    folderId: folder.folderId,
    folderPath: folder.path,
  };
}

/** Record files picked in the Google Picker, or just uploaded, on this lecture. */
export async function attachDriveFilesAction(
  meetingId: string,
  fileIds: string[]
): Promise<void> {
  const { supabase, workspaceId, userId } = await signedIn();

  const meeting = await getMeeting(supabase, workspaceId, meetingId);
  if (!meeting) throw new Error(`attachDriveFilesAction: no lecture ${meetingId} here`);

  await attachDriveFiles(supabase, {
    workspaceId,
    userId,
    fileIds,
    meetingId: meeting.id,
    courseId: meeting.course_id,
  });

  revalidatePath(`/lecture/${meetingId}`);
}

/** A small image — a pasted screenshot, a photo of the board — for this lecture. */
export async function saveLectureImageAction(
  meetingId: string,
  formData: FormData
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const meeting = await getMeeting(supabase, workspaceId, meetingId);
  if (!meeting) throw new Error(`saveLectureImageAction: no lecture ${meetingId} here`);

  const image = formData.get('image');
  if (!(image instanceof File)) throw new Error('saveLectureImageAction: no image');

  await saveNoteImage(supabase, {
    workspaceId,
    meetingId: meeting.id,
    courseId: meeting.course_id,
    name: image.name === '' ? 'Pasted image' : image.name,
    mimeType: image.type,
    bytes: new Uint8Array(await image.arrayBuffer()),
  });

  revalidatePath(`/lecture/${meetingId}`);
}

/**
 * Take a file off this lecture.
 *
 * Removes the reference only. A Drive file stays exactly where it is — the app
 * never deletes one (prompts/09-drive.md point 5).
 */
export async function removeLectureFileAction(
  meetingId: string,
  fileId: string
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await removeFile(supabase, workspaceId, fileId);

  revalidatePath(`/lecture/${meetingId}`);
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
