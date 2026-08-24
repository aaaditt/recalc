'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import {
  createOneOffMeeting,
  rescheduleMeeting,
  setMeetingStatus,
} from '@/modules/courses';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only, as CLAUDE.md's layout rule asks: every one of these does the
// same three things — check who is asking, hand the work to the module, tell
// the router the data moved. No SQL, no business rules.
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

// A change to a lecture shows on both screens that draw lectures.
function refreshed() {
  revalidatePath('/calendar');
  revalidatePath('/today');
}

/** Drag to move or resize. Touches exactly one dated lecture. */
export async function rescheduleMeetingAction(
  id: string,
  startsAt: string,
  endsAt: string
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await rescheduleMeeting(supabase, workspaceId, id, { startsAt, endsAt });
  refreshed();
}

/** One tap: cancel this class, or put it back. */
export async function setMeetingCancelledAction(
  id: string,
  cancelled: boolean
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await setMeetingStatus(supabase, workspaceId, id, cancelled ? 'cancelled' : 'scheduled');
  refreshed();
}

/** A make-up lecture, a guest lecture, an exam: session_id stays null. */
export async function addOneOffMeetingAction(input: {
  courseId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  room: string;
}): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await createOneOffMeeting(supabase, {
    workspaceId,
    courseId: input.courseId,
    date: input.date,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    room: input.room.trim() === '' ? null : input.room.trim(),
    timeZone: localTimeZone(),
  });

  refreshed();
}
