import type { ReactNode } from 'react';

import { AppNav } from '@/components/app-nav';
import { createClient } from '@/lib/supabase/server';
import { getStaleCount } from '@/modules/recalc';
import { ensureWorkspace } from '@/modules/workspaces';

// The signed-in shell. /login and /styleguide sit outside this route group on
// purpose — neither wants navigation.
//
// The group changes no URLs: app/(app)/(narrow)/today/page.tsx is still /today.
//
// The column width belongs to the nested (narrow) group rather than to this
// layout, because /calendar is a grid and wants more room than a page of text
// should ever have. Everything else goes in (narrow) and gets the reading
// column for free.
//
// It reads one number, and only one: how many things are waiting in /review.
// That badge has to be on every screen — it is the thing that makes the app
// worth opening — and the layout is the only place that renders on every
// screen. It is a single indexed `count`, and the actions that change the queue
// revalidate this layout so the number never lies.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out, the proxy is already redirecting; the shell just draws no badge
  // rather than failing on the way there.
  const staleCount = user
    ? await getStaleCount(supabase, (await ensureWorkspace(supabase, user.id)).id)
    : 0;

  return (
    <div className="flex min-h-full flex-1">
      <AppNav staleCount={staleCount} />

      <main className="min-w-0 flex-1 px-4 pt-6 pb-(--content-pad-bottom) md:px-8 md:pt-8 md:pb-12">
        {children}
      </main>
    </div>
  );
}
