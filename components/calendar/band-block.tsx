// One band, drawn on the 24-hour grid as a container rather than as a pile of
// blocks.
//
// The whole bargain of this view: a band says what it is, how full it is, and
// where its density sits, and the individual classes are what you get when you
// open it. Drawing them here too would make the summary pointless and would
// need an 80px hour row, which is a day you scroll twice to see.
//
// A band has no colour of its own — docs/DESIGN.md principle 4, colour
// identifies a course and nothing else. The only colour in here is on the tick
// rail, and it belongs to the courses inside.
//
// Presentational. It is handed a band and what is in it, and knows nothing
// about grids, drags or databases.

import { Pill } from '@/components/ui/pill';
import { bandRangeLabel, type BandView, type Tick } from '@/lib/bands';
import type { CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';

export type BandTick = Tick & { colour: CourseColour | null };

type BandBlockProps = {
  band: BandView;
  /** The line under the name: '5 classes · 1h 20m free', or 'Nothing planned'. */
  summary: string;
  ticks: BandTick[];
  /** True when the clock is inside this band right now. */
  current?: boolean;
  /** Under ~64px there is only room for the name. */
  compact?: boolean;
};

export function BandBlock({
  band,
  summary,
  ticks,
  current = false,
  compact = false,
}: BandBlockProps) {
  return (
    <div
      className={cx(
        'flex h-full w-full flex-col gap-1 overflow-hidden rounded-card border text-left',
        'px-3 py-2 transition-colors duration-100',
        // "Quiet chrome, warm content." A band is chrome, so it is a hairline
        // and a surface, and the one you are inside is a shade less quiet.
        current ? 'border-border bg-sunken' : 'border-line bg-surface hover:bg-sunken'
      )}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-13 font-medium">{band.name}</span>
        {current ? (
          <Pill className="shrink-0">Now</Pill>
        ) : (
          <span className="shrink-0 font-mono text-12 text-faint tabular-nums">
            {bandRangeLabel(band)}
          </span>
        )}
      </div>

      {compact ? null : (
        <>
          <p className="truncate text-12 text-muted">{summary}</p>

          {/* Where the day's density sits, as a hairline rail. Marks are the
              only colour on this screen and they are course colours. */}
          {ticks.length > 0 ? (
            <div className="relative mt-auto w-full" style={{ height: 'var(--band-tick-height)' }}>
              {ticks.map((tick) => (
                <span
                  key={tick.key}
                  className={cx(
                    'absolute inset-y-0 rounded-full',
                    tick.colour ? null : 'bg-border'
                  )}
                  style={{
                    left: `${tick.leftPercent}%`,
                    width: `${tick.widthPercent}%`,
                    ...(tick.colour
                      ? { backgroundColor: `var(--course-${tick.colour})` }
                      : null),
                  }}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
