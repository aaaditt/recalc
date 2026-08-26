import Link from 'next/link';

import { Card } from '@/components/ui/card';

// The strip prompts/07-focus.md asks for: "minutes studied today". Two numbers
// and a way in, which is also the constraint — "do not build a stats
// dashboard. Two numbers on /today is enough for now."
//
// It doubles as the app's front door to /focus. The bottom nav is full at five
// columns (docs/DECISIONS.md), and a timer is something you start from the page
// you already opened at 7:45am, so the entry point lives here rather than in
// the chrome.
//
// Presentational: it is handed two already-formatted strings and knows nothing
// about where they came from.

type StudyStripProps = {
  /** Already through `formatMinutes` — '45m', '1h 25m', '0m'. */
  today: string;
  week: string;
};

function Number({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-label text-faint uppercase">{label}</p>
      <p className="pt-1 font-mono text-20 tabular-nums">{value}</p>
    </div>
  );
}

export function StudyStrip({ today, week }: StudyStripProps) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex gap-8">
        <Number label="Today" value={today} />
        <Number label="This week" value={week} />
      </div>

      <Link
        href="/focus"
        className="text-14 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
      >
        Start a focus block
      </Link>
    </Card>
  );
}
