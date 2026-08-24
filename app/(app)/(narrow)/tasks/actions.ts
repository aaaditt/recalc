'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  createTask,
  deleteTask,
  setTaskStatus,
  updateTask,
  type TaskStatus,
} from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only, as CLAUDE.md's layout rule asks: check who is asking, hand the
// work to the module, tell the router the data moved. No SQL and no rules about
// tasks live here — in particular, every check that a courseId, unitId or
// meetingId belongs to this workspace is inside modules/tasks, so a second
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

// A task shows on four screens. Changing one changes all of them.
function refreshed() {
  revalidatePath('/tasks');
  revalidatePath('/today');
  revalidatePath('/calendar');
}

/** Empty string means "not set" everywhere a form posts an optional id. */
function optional(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/** Quick add, and the "+" on /tasks. The parsing already happened in the browser. */
export async function addTaskAction(input: {
  title: string;
  courseId: string | null;
  unitId?: string | null;
  meetingId?: string | null;
  dueAt: string | null;
  sourceBlockId?: string | null;
}): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await createTask(supabase, {
    workspaceId,
    title: input.title,
    courseId: input.courseId,
    unitId: input.unitId ?? null,
    meetingId: input.meetingId ?? null,
    dueAt: input.dueAt,
    sourceBlockId: input.sourceBlockId ?? null,
  });

  refreshed();
}

/** One tap on a checkbox, from /tasks, /today or a lecture page. */
export async function setTaskStatusAction(id: string, status: TaskStatus): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await setTaskStatus(supabase, workspaceId, id, status);
  refreshed();
}

/** The same thing as a plain <form>, so completing a task needs no JavaScript. */
export async function toggleTaskDoneAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const done = String(formData.get('done') ?? '') === 'true';
  await setTaskStatusAction(id, done ? 'done' : 'open');
}

/** The edit sheet. Every id in here is client-supplied and re-checked inside the module. */
export async function updateTaskAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  const id = String(formData.get('id') ?? '');
  const dueDate = optional(formData.get('dueDate'));
  const dueTime = optional(formData.get('dueTime')) ?? '23:59';

  await updateTask(supabase, workspaceId, id, {
    title: String(formData.get('title') ?? ''),
    courseId: optional(formData.get('courseId')),
    unitId: optional(formData.get('unitId')),
    notes: optional(formData.get('notes')),
    // A local day plus a local time, turned into an instant by the server's own
    // zone — the same zone every other date on these screens is read in.
    dueAt: dueDate === null ? null : new Date(`${dueDate}T${dueTime}:00`).toISOString(),
    status: (optional(formData.get('status')) ?? 'open') as TaskStatus,
  });

  refreshed();
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await deleteTask(supabase, workspaceId, String(formData.get('id') ?? ''));
  refreshed();
}
