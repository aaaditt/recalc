import type { ReactNode } from 'react';

import { dismissHintAction } from './hint-actions';
import { AppNav } from '@/components/app-nav';
import { HintLine } from '@/components/hints/hint-line';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { hintFor } from '@/modules/hints';
import { getProfile } from '@/modules/profiles';
import { getStaleCount } from '@/modules/recalc';

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
  // Signed out, the proxy is already redirecting; the shell just draws no badge
  // rather than failing on the way there.
  //
  // Slice 19: `currentWorkspace` is memoised for the length of the request, so
  // the page rendering inside this layout asks the same two questions for free
  // rather than paying two more round trips for the same answers.
  const found = await currentWorkspace();

  // Two questions, asked together rather than one after the other — slice 19's
  // rule. The profile is for the account row at the foot of the sidebar, which
  // is the only way to Settings on a laptop.
  const [staleCount, profile] = found
    ? await Promise.all([
        getStaleCount(await createClient(), found.workspace.id),
        getProfile(await createClient(), found.user.id),
      ])
    : [0, null];

  // Slice 21. The nav has carried this number since slice 11 and has never said
  // what it means; the first time anything goes out of date, one line does.
  //
  // It costs nothing: `staleCount` was already read for the badge, and which
  // hints have been dismissed came down with the session, in parallel with the
  // workspace. `hintFor` is a pure function. There is no query here.
  const hint = found ? hintFor('shell', { staleCount }, found.dismissed) : null;

  return (
    // `items-start` so the sticky sidebar is free to be one viewport tall
    // rather than being stretched to the height of the page beside it.
    <div className="flex min-h-full flex-1 items-start">
      <AppNav staleCount={staleCount} username={profile?.username ?? null} />

      <main className="min-w-0 flex-1 px-4 pt-6 pb-(--content-pad-bottom) md:px-8 md:pt-8 md:pb-12">
        {/* Above the page rather than inside it: this one is about the app, not
            about whichever screen you happen to be on. */}
        {hint ? (
          <div className="mx-auto w-full max-w-(--page-width-wide) pb-4">
            <HintLine hint={hint} dismiss={dismissHintAction.bind(null, hint.id)} />
          </div>
        ) : null}

        {children}
      </main>
    </div>
  );
}
