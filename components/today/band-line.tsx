// Which part of the day this is, on the screen opened at 7:45am.
//
// One line, and it earns its place by answering a question the rest of /today
// cannot: not "what is on" but "where am I, and how much of this is left". At
// 10:00 on a Tuesday the useful sentence is "you are at university until 15:40,
// next is ME301 at 10:15, and the evening starts at 18:00".
//
// It renders nothing when the clock is inside no band. That is the design:
// docs/DESIGN.md, "What not to build" — an evening nobody has planned should
// not be announced as one.
//
// Presentational, and no colour: a band is chrome (docs/DESIGN.md principle 4).

import Link from 'next/link';

import type { BandLine as BandLineValues } from '@/lib/bands';

export function BandLine({ line }: { line: BandLineValues | null }) {
  if (!line) return null;

  return (
    <Link
      href="/calendar?v=full"
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-card border border-line bg-surface px-4 py-3 transition-colors duration-100 hover:bg-sunken"
    >
      <span className="text-14 font-medium">You&rsquo;re in {line.name}</span>
      <span className="font-mono text-12 text-muted tabular-nums">until {line.untilAt}</span>

      {line.nextInside ? (
        <span className="text-12 text-muted">
          · next {line.nextInside.label} at{' '}
          <span className="font-mono tabular-nums">{line.nextInside.at}</span>
        </span>
      ) : (
        <span className="text-12 text-muted">· nothing else scheduled in it</span>
      )}

      {line.nextBand ? (
        <span className="text-12 text-faint">
          · then {line.nextBand.name} at{' '}
          <span className="font-mono tabular-nums">{line.nextBand.at}</span>
        </span>
      ) : null}
    </Link>
  );
}
