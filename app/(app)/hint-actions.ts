'use server';

import { revalidatePath } from 'next/cache';

import { requireWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { dismissHint, hintIdSchema } from '@/modules/hints';

// One action, shared by every screen that can show a hint. Slice 21.
//
// It lives beside the shell rather than in each route's own `actions.ts` because
// there is one behaviour — "put this line away" — and five callers. A copy per
// screen would be five places for it to drift.
//
// The id is parsed rather than trusted. A server action is a public POST
// endpoint, and this one writes a key into a `jsonb` map on `profiles`; an
// unparsed string would let anyone with a session put arbitrary keys in there.
// Nothing terrible follows from that, which is exactly why it would never be
// noticed.

export async function dismissHintAction(id: string): Promise<void> {
  const parsed = hintIdSchema.safeParse(id);
  if (!parsed.success) return;

  const { user } = await requireWorkspace();
  await dismissHint(await createClient(), user.id, parsed.data);

  // The shell carries one of these, so every screen's copy is stale after this.
  // `layout` rather than `page`, because app/(app)/layout.tsx is what draws the
  // hint that appears everywhere.
  revalidatePath('/', 'layout');
}
