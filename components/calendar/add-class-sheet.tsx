// Add a one-off: a make-up lecture, a guest lecture, an exam.
//
// It is written straight into class_meetings with `session_id` null, which is
// what keeps generateMeetings from ever seeing it, moving it or duplicating
// it. The weekly pattern stays the weekly pattern.
//
// The inputs are styled here rather than in a primitive: /components/ui has no
// Input yet, and docs/DECISIONS.md already records that slice 06 — the first
// slice with a real form — is the one that should add it.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { CalendarDate } from '@/lib/time';

const FIELD =
  'h-(--control-height) w-full rounded-card border border-border bg-surface px-3 text-14 text-ink';
const LABEL = 'font-mono text-label text-faint uppercase';

export type CourseOption = { id: string; code: string; name: string };

export function AddClassSheet({
  open,
  date,
  courses,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  date: CalendarDate;
  courses: CourseOption[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    courseId: string;
    date: CalendarDate;
    startsAt: string;
    endsAt: string;
    room: string;
  }) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const startsAt = String(form.get('startsAt') ?? '');
    const endsAt = String(form.get('endsAt') ?? '');
    if (endsAt <= startsAt) {
      setError('It has to end after it starts.');
      return;
    }

    setError(null);
    onCreate({
      courseId: String(form.get('courseId') ?? ''),
      date: String(form.get('date') ?? '') as CalendarDate,
      startsAt,
      endsAt,
      room: String(form.get('room') ?? ''),
    });
  }

  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title="Add a one-off class">
      {courses.length === 0 ? (
        <p className="text-14 text-muted">
          There are no courses yet, so there is nothing to add a class to.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Course</span>
            <select name="courseId" required defaultValue={courses[0].id} className={FIELD}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={LABEL}>Date</span>
            <input type="date" name="date" required defaultValue={date} className={FIELD} />
          </label>

          <div className="flex gap-4">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={LABEL}>Starts</span>
              <input
                type="time"
                name="startsAt"
                required
                defaultValue="09:00"
                className={FIELD}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={LABEL}>Ends</span>
              <input
                type="time"
                name="endsAt"
                required
                defaultValue="10:30"
                className={FIELD}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={LABEL}>Room</span>
            <input type="text" name="room" placeholder="B204" className={FIELD} />
          </label>

          {error ? <p className="text-13 text-accent">{error}</p> : null}

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add class'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
