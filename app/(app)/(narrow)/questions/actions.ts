'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  answerQuestion,
  askQuestion,
  reopenQuestion,
  resolveQuestion,
} from '@/modules/questions';
import { ensureWorkspace } from '@/modules/workspaces';

// Routing only: who is asking, hand it to the module, say what moved.
//
// There is no `/questions` page — this directory holds no page.tsx and creates
// no route. Questions are shown on three screens (a lecture, a note and a
// course), and all three need exactly these three actions, so they live once
// here rather than three times over. `revalidatePath` is given the *route
// patterns* rather than concrete paths, so answering a question on a lecture
// page also refreshes the course page that counts it.
//
// Every one of these takes a block id that arrives from a browser, and none of
// them checks it here: modules/questions proves it against this workspace
// before it writes, so no call site can forget the check because no call site
// performs it. That is the pattern slices 04 through 11 arrived at the hard way
// (docs/DECISIONS.md).
//
// The session is re-derived on every call. A server action is a public POST
// endpoint, and the fact that the page which rendered the button was behind
// auth proves nothing about the request that arrives.

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const workspace = await ensureWorkspace(supabase, user.id);
  return { supabase, workspaceId: workspace.id, userId: user.id };
}

/** Every screen a question is counted on, plus the shell that holds the badge. */
function refreshQuestions() {
  revalidatePath('/lecture/[meetingId]', 'page');
  revalidatePath('/notes/[id]', 'page');
  revalidatePath('/courses/[id]', 'page');
  revalidatePath('/courses');
  revalidatePath('/review');
  revalidatePath('/', 'layout');
}

/**
 * "Ask about this" — a sentence is selected in a note and a question is typed.
 *
 * Both the wording and the anchored block ids come from the browser. The text
 * is the user's own words in their own workspace; the ids are not trusted at
 * all, and modules/questions refuses any that are not live blocks here.
 */
export async function askQuestionAction(input: {
  text: string;
  anchorBlockIds: string[];
}): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  await askQuestion(supabase, {
    workspaceId,
    text: input.text,
    anchorBlockIds: input.anchorBlockIds,
  });

  refreshQuestions();
}

/**
 * "Answer it."
 *
 * Never automatic — docs/PRODUCT.md rule 2. This is slice 11's engine with a
 * second recipe; nothing about running a derivation happens in this file.
 */
export async function answerQuestionAction(
  questionBlockId: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, workspaceId, userId } = await signedIn();

  const result = await answerQuestion(supabase, { workspaceId, userId }, questionBlockId);

  refreshQuestions();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** The one status only a person can set, and the way back from a mis-tap. */
export async function setQuestionResolvedAction(
  questionBlockId: string,
  resolved: boolean
): Promise<void> {
  const { supabase, workspaceId } = await signedIn();

  if (resolved) await resolveQuestion(supabase, workspaceId, questionBlockId);
  else await reopenQuestion(supabase, workspaceId, questionBlockId);

  refreshQuestions();
}

/**
 * The same thing from a plain `<form>`, which is how the course page does it —
 * that screen is server-rendered and needs no JavaScript to tick a question off.
 */
export async function resolveQuestionFormAction(formData: FormData): Promise<void> {
  await setQuestionResolvedAction(
    String(formData.get('questionBlockId') ?? ''),
    String(formData.get('resolved') ?? '') === 'true'
  );
}
