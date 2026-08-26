import Link from 'next/link';

import { Card } from '@/components/ui/card';

// prompts/10-agents.md point 5: "if no `fast` role is configured, `/today`
// shows a single quiet prompt to set it up. Not a modal, not a wizard."
//
// So: one line, in the neutral palette, under the study strip. It uses no
// accent — docs/DESIGN.md reserves that for "something needs attention" and the
// now-line, and a model that is not set up yet is not an alarm. It disappears
// the moment a `fast` key is saved and never comes back.
//
// Presentational, like every other strip on this page: it takes nothing and
// knows nothing.

export function SetUpAgentsStrip() {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="min-w-0 text-14 text-muted">
        No AI model set up yet. Recalc can&rsquo;t summarise or answer anything until
        one is.
      </p>
      <Link
        href="/settings/agents"
        className="text-14 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
      >
        Add a key
      </Link>
    </Card>
  );
}
