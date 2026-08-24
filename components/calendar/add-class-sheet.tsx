// Add a one-off: a make-up lecture, a guest lecture, an exam.
//
// It is written straight into class_meetings with `session_id` null, which is
// what keeps generateMeetings from ever seeing it, moving it or duplicating
// it. The weekly pattern stays the weekly pattern.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import type { CalendarDate } from '@/lib/time';

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
          <Field label="Course">
            <Select name="courseId" required defaultValue={courses[0].id}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date">
            <Input type="date" name="date" required defaultValue={date} />
          </Field>

          <div className="flex gap-4">
            <Field label="Starts" className="flex-1">
              <Input type="time" name="startsAt" required defaultValue="09:00" />
            </Field>
            <Field label="Ends" className="flex-1">
              <Input type="time" name="endsAt" required defaultValue="10:30" />
            </Field>
          </div>

          <Field label="Room">
            <Input type="text" name="room" placeholder="B204" />
          </Field>

          {error ? <p className="text-13 text-accent">{error}</p> : null}

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add class'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
