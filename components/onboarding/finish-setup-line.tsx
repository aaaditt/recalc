import Link from 'next/link';

import { Card } from '@/components/ui/card';

// The whole of onboarding's footprint on /today: one line.
//
// It replaces the five-step card from slice 17, which had to list every step
// because /today was the only place they lived. They live at `/start` now, so
// this only has to point at it.
//
// There is no `/start` entry in the nav, and that is a measured decision rather
// than a tidiness one: `components/app-nav.tsx` renders on every page in the
// signed-in shell, so a link there would mean reading onboarding state on every
// navigation — about 600ms against a database in ap-southeast-2, permanently,
// for a link that matters for two days. See docs/DECISIONS.md.
//
// Neutrals, no accent, in the shape `components/today/setup-agents.tsx` already
// uses — because an unfinished setup is not an alarm. It goes away when Act 1 is
// complete or when the user says they are done.

export function FinishSetupLine({ doneCount, total }: { doneCount: number; total: number }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="min-w-0 text-14 text-muted">
        {doneCount === 0
          ? 'Recalc is empty until you put your semester in.'
          : `${doneCount} of ${total} set up.`}
      </p>
      <Link
        href="/start"
        className="text-14 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
      >
        Finish setting up
      </Link>
    </Card>
  );
}
