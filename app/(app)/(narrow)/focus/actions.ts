'use server';

import { revalidatePath } from 'next/cache';

import { sessionMinutes } from '@/lib/study';
import { createClient } from '@/lib/supabase/server';
import { logStudySession, setFocusRating } from '@/modules/study';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only, the same shape as /tasks' actions: check who is asking, hand
// the work to the module, tell the router the numbers moved.
//
// The timer sends a courseId, a unitId and two instants — all four are things
// the browser chose, so all four are checked inside modules/study rather than
// here. The one id that is never client-supplied is the workspace: it is
// re-derived from the session on every call, because a server action is a
// public POST endpoint and the page that drew the button proves nothing about
// the request that arrives.

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
 * A finished focus block, written down.
 *
 * Returns the row's id so the rating question has something to attach to, and
 * the minutes so the card can say how many were logged. Both come back from
 * the row that was actually stored — logging the same block twice returns the
 * first row rather than a second one, so the answer is the same either way.
 */
export async function logStudySessionAction(input: {
  courseId: string;
  unitId: string | null;
  startedAt: string;
  endedAt: string;
}): Promise<{ id: string; minutes: number }> {
  const { supabase, workspaceId } = await signedIn();

  const session = await logStudySession(supabase, {
    workspaceId,
    courseId: input.courseId,
    unitId: input.unitId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  });

  // /today carries the strip these minutes are counted on.
  revalidatePath('/today');

  return {
    id: session.id,
    minutes: sessionMinutes({
      courseId: session.course_id,
      unitId: session.unit_id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
    }),
  };
}

/** The one optional question, answered. Skipping it never calls this. */
export async function setFocusRatingAction(id: string, rating: number): Promise<void> {
  const { supabase, workspaceId } = await signedIn();
  await setFocusRating(supabase, workspaceId, id, rating);
}
