import type { ReactNode } from 'react';

// The reading column: wide enough to read, narrow enough that a line of a task
// title is not a paragraph. Every signed-in screen except the calendar wants
// it, so it lives in a route group rather than in a wrapper each page has to
// remember. No URLs change — /today is still /today.
export default function NarrowLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-(--page-width)">{children}</div>;
}
