// A deadline, as a chip.
//
// docs/DESIGN.md is emphatic: "Deadlines are not classes. They go in a slim
// all-day row pinned above the grid, as chips. Do not put a due date inside
// the time grid." Nothing in this file knows how to position itself in a time
// grid, which is the cheapest way to keep that true.

import { courseDot } from '@/lib/course-colours';
import type { CalendarDeadline } from '@/lib/calendar';
import { timeAt } from '@/lib/calendar';

export function DeadlineChip({
  deadline,
  timeZone,
}: {
  deadline: CalendarDeadline;
  timeZone: string;
}) {
  return (
    <span
      title={`${deadline.title} · ${timeAt(deadline.dueAt, timeZone)}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sunken px-2 py-1 text-12 leading-none text-muted"
    >
      {deadline.colour ? <span style={courseDot(deadline.colour)} /> : null}
      <span className="truncate">{deadline.code ?? deadline.title}</span>
    </span>
  );
}
