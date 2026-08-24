import type { ReactNode } from 'react';

import { AppNav } from '@/components/app-nav';

// The signed-in shell. /login and /styleguide sit outside this route group on
// purpose — neither wants navigation.
//
// The group changes no URLs: app/(app)/today/page.tsx is still /today.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <AppNav />

      <main className="min-w-0 flex-1 px-4 pt-6 pb-(--content-pad-bottom) md:px-8 md:pt-8 md:pb-12">
        {/* Wide enough to read, narrow enough that a line of a task title is
            not a paragraph. */}
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
