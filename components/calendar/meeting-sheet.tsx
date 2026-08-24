// One lecture, opened from the grid.
//
// docs/DESIGN.md says a class taps through to the lecture page. Slice 05 built
// that page, so this sheet is now the short way in: the header — code, name,
// date, time, room, cancelled state — the one-tap cancel, and the link
// through to where the lecture actually lives.

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { courseDot } from '@/lib/course-colours';
import { dayTitle, timeRange, type CalendarMeeting } from '@/lib/calendar';
import { localDateKey } from '@/lib/time';

export function MeetingSheet({
  meeting,
  timeZone,
  busy,
  onClose,
  onSetCancelled,
}: {
  meeting: CalendarMeeting | null;
  timeZone: string;
  busy: boolean;
  onClose: () => void;
  onSetCancelled: (id: string, cancelled: boolean) => void;
}) {
  if (!meeting) return null;

  const date = localDateKey(new Date(meeting.startsAt), timeZone);

  return (
    <Sheet open onClose={onClose} title={meeting.code}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span style={courseDot(meeting.colour)} />
            <span className="font-mono text-12 font-medium">{meeting.code}</span>
            {meeting.cancelled ? <Pill>Cancelled</Pill> : null}
          </div>
          <p className="mt-1 text-20 font-medium">{meeting.name}</p>
        </div>

        <dl className="flex flex-col gap-2 text-14">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Date</dt>
            <dd className="text-right">{dayTitle(date)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Time</dt>
            <dd className="text-right font-mono">{timeRange(meeting, timeZone)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Room</dt>
            <dd className="text-right">{meeting.room ?? '—'}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <Link
            href={`/lecture/${meeting.id}`}
            className="inline-flex h-(--control-height) items-center justify-center rounded-card bg-ink px-(--control-padding-x) text-14 font-medium text-bg transition-opacity duration-100 hover:opacity-90"
          >
            Open lecture
          </Link>

          <Button
            disabled={busy}
            onClick={() => onSetCancelled(meeting.id, !meeting.cancelled)}
          >
            {meeting.cancelled ? 'Un-cancel this class' : 'Cancel this class'}
          </Button>

          <p className="text-12 text-muted">
            Notes, files and the syllabus topic live on the lecture page. A cancelled
            class stays on the calendar, struck through — knowing it is cancelled is
            more useful than it vanishing.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
