import type { ReactNode } from 'react';

import { AppNav } from '@/components/app-nav';

// The signed-in shell. /login and /styleguide sit outside this route group on
// purpose — neither wants navigation.
//
// The group changes no URLs: app/(app)/(narrow)/today/page.tsx is still /today.
//
// The column width belongs to the nested (narrow) group rather than to this
// layout, because /calendar is a grid and wants more room than a page of text
// should ever have. Everything else goes in (narrow) and gets the reading
// column for free.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <AppNav />

      <main className="min-w-0 flex-1 px-4 pt-6 pb-(--content-pad-bottom) md:px-8 md:pt-8 md:pb-12">
        {children}
      </main>
    </div>
  );
}
