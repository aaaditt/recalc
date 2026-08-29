'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { FIRST_RUN_COOKIE } from '@/lib/first-run';

// The one thing /today itself writes, and it is not data.
//
// The first-run card disappears on its own the moment there is a real course to
// look at, so this exists only for "yes, I know, leave me alone" before then. A
// cookie rather than a column: it is a fact about this browser's patience, not
// about the semester, and it does not deserve a migration.

/** Hide the setup card for good. */
export async function skipFirstRunAction(): Promise<void> {
  const jar = await cookies();
  jar.set(FIRST_RUN_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    // A year. There is nothing to protect here and nothing to expire.
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  revalidatePath('/today');
}
