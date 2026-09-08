import { courseRail, courseTint } from '@/lib/course-colours';
import { cx } from '@/lib/cx';
import {
  buildCompare,
  periodRange,
  weekdayName,
  WEEKDAYS,
  type FriendBlock,
  type TimetableClass,
  type TimetablePeriod,
} from '@/lib/timetable';

// Two weeks in one grid — slice 23.
//
// Read-only, and a different component from `timetable-grid.tsx` rather than a
// flag on it. That grid's whole job is that every cell is a button; this one has
// nothing to press, and half of what it draws belongs to somebody who did not
// give anybody permission to edit it. One `readOnly` prop would have made the
// two jobs share a component and share a bug.
//
// The useful thing here is not their timetable, it is the hours you are both
// free, so those are what the eye lands on: your classes in their course
// colours, theirs in flat neutral — they are somebody else's and do not get to
// look like yours — and everything else quietly marked as shared free time.
//
// Their blocks are placed by start time, never by period id: the ids come from
// their grid and mean nothing on yours. Anything of theirs that does not fit a
// row of yours is listed under the grid rather than dropped, because an hour
// they are busy that this screen calls free is the one thing it must never say.

export function CompareGrid({
  periods,
  mine,
  theirs,
  friendName,
  detailed,
}: {
  periods: TimetablePeriod[];
  mine: TimetableClass[];
  theirs: FriendBlock[];
  /** For the legend, and for the sentence under an unplaced class. */
  friendName: string;
  /** They share `full`, so their blocks carry a course code. */
  detailed: boolean;
}) {
  const { rows, unplaced } = buildCompare(periods, mine, theirs);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 pb-3">
        <Legend className="bg-ok-bg text-ok">Both free</Legend>
        <Legend className="bg-sunken text-muted">{friendName}</Legend>
        <span className="text-12 text-muted">Your classes keep their colours.</span>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `var(--timetable-label-width) repeat(${WEEKDAYS.length}, minmax(var(--timetable-column-min), 1fr))`,
          }}
        >
          <div className="sticky left-0 z-20 border-b border-line bg-sunken px-3 py-2">
            <span className="font-mono text-label text-faint uppercase">Period</span>
          </div>
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="border-b border-l border-line bg-sunken px-3 py-2 text-center"
            >
              <span className="font-mono text-label text-faint uppercase">
                <span className="sm:hidden">{weekdayName(weekday).short}</span>
                <span className="hidden sm:inline">{weekdayName(weekday).long}</span>
              </span>
            </div>
          ))}

          {rows.map((row) => {
            const period = row[0].period;
            return (
              <div key={period.id} className="contents">
                <div className="sticky left-0 z-10 flex min-h-(--timetable-row-height) flex-col justify-center border-b border-line bg-surface px-3">
                  <span className="font-mono text-14 font-medium">{period.label}</span>
                  <span className="font-mono text-12 whitespace-nowrap text-muted">
                    {periodRange(period.startsAt, period.endsAt)}
                  </span>
                </div>

                {row.map((cell) => (
                  <div
                    key={`${period.id}-${cell.weekday}`}
                    className={cx(
                      'flex min-h-(--timetable-row-height) flex-col gap-(--block-gap) border-b border-l border-line p-1',
                      cell.bothFree ? 'bg-ok-bg' : ''
                    )}
                  >
                    {cell.mine.map((item) => (
                      <div
                        key={item.sessionId}
                        style={{ ...courseRail(item.colour), ...courseTint(item.colour) }}
                        className="flex flex-1 flex-col items-start justify-center gap-0.5 rounded-block px-(--block-pad-inline) py-(--block-pad-block)"
                      >
                        <span className="w-full truncate font-mono text-12 font-medium">
                          {item.code}
                        </span>
                        <span className="w-full truncate font-mono text-12 text-muted">
                          {item.room ?? ''}
                        </span>
                      </div>
                    ))}

                    {cell.theirs.map((block, index) => (
                      <div
                        key={`${block.startsAt}-${index}`}
                        className="flex flex-1 flex-col items-start justify-center gap-0.5 rounded-block bg-sunken px-(--block-pad-inline) py-(--block-pad-block)"
                      >
                        <span className="w-full truncate font-mono text-12 text-muted">
                          {/* At `busy` there is nothing to name, and the block
                              says so rather than showing an empty rectangle. */}
                          {detailed && block.code ? block.code : 'Busy'}
                        </span>
                        {detailed && block.room ? (
                          <span className="w-full truncate font-mono text-12 text-faint">
                            {block.room}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {unplaced.length > 0 ? (
        <p className="mt-3 text-12 text-muted">
          {unplaced.length === 1 ? 'One class of' : `${unplaced.length} classes of`}{' '}
          {friendName}&rsquo;s does not sit on your grid — their periods run at different
          times from yours. {unplaced.length === 1 ? 'It is' : 'They are'} not counted in
          the free hours above.
        </p>
      ) : null}
    </>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cx('h-3 w-3 rounded-full', className)} />
      <span className="text-12 text-muted">{children}</span>
    </span>
  );
}
