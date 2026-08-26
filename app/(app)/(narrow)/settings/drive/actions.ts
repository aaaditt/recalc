'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { disconnectGoogleAccount } from '@/modules/google';

// Routing only: who is asking, hand it to the module, say what moved.

export async function disconnectDriveAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  await disconnectGoogleAccount(supabase, user.id);

  revalidatePath('/settings/drive');
  // Every lecture page's Files section changes shape when Drive goes away.
  revalidatePath('/lecture', 'layout');
}
