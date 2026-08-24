'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import { generateMeetings, type GenerateMeetingsResult } from '@/modules/courses';
import { ensureWorkspace } from '@/modules/workspaces';

// The one-time job that expands the weekly pattern into the term's dated
// lectures. Safe to run twice: `generateMeetings` never duplicates a lecture
// and never touches one that has been hand-edited — a note, a topic, a unit, a
// cancellation. That guarantee is the module's, and there is a test on it at
// modules/courses/meetings.test.ts.

function back(query: Record<string, string>): never {
  redirect(`/settings/semester?${new URLSearchParams(query).toString()}`);
}

export async function generateMeetingsAction(formData: FormData): Promise<void> {
  const termStart = String(formData.get('termStart') ?? '');
  const termEnd = String(formData.get('termEnd') ?? '');
  const term = String(formData.get('term') ?? '').trim();

  if (!termStart || !termEnd) back({ error: 'Pick both a start and an end date.' });
  if (termEnd < termStart) back({ error: 'The term ends before it starts.' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const workspace = await ensureWorkspace(supabase, user.id);

  let result: GenerateMeetingsResult;
  try {
    result = await generateMeetings(supabase, {
      workspaceId: workspace.id,
      termStart,
      termEnd,
      term: term === '' ? undefined : term,
      timeZone: localTimeZone(),
    });
  } catch (error) {
    back({ error: error instanceof Error ? error.message : 'Could not generate.' });
  }

  revalidatePath('/calendar');
  revalidatePath('/today');

  back({
    termStart,
    termEnd,
    created: String(result.created),
    updated: String(result.updated),
    unchanged: String(result.unchanged),
  });
}
