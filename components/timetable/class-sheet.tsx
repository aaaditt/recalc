'use client';

// The one form behind /timetable: add a class to an empty cell, or change the
// one already in it.
//
// Both jobs are the same three questions — which course, which room, is it a
// lab — so they are one component. The only thing an empty cell asks that a
// filled one does not is "or is this a course you have not entered yet", and
// that is the whole reason clicking a cell is faster than a settings screen.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { COURSE_COLOURS, courseDot, type CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';
import { periodRange, weekdayName, type TimetableClass } from '@/lib/timetable';

export type SheetCourse = { id: string; code: string; name: string };

/** Which cell is open, and what is already in it. */
export type OpenCell = {
  periodId: string;
  periodLabel: string;
  periodStartsAt: string;
  periodEndsAt: string;
  weekday: number;
  existing: TimetableClass | null;
};

export type ClassFormValues = {
  courseId: string | null;
  newCourse: { code: string; name: string; colour: CourseColour } | null;
  room: string;
  isLab: boolean;
};

const NEW_COURSE = '__new__';

export function ClassSheet({
  cell,
  courses,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  cell: OpenCell | null;
  courses: SheetCourse[];
  busy: boolean;
  onClose: () => void;
  onSave: (cell: OpenCell, values: ClassFormValues) => void;
  onRemove: (cell: OpenCell) => void;
}) {
  // Keyed on the cell below, so every one of these starts fresh when a
  // different cell is opened.
  const existing = cell?.existing ?? null;
  const [choice, setChoice] = useState<string>(
    existing?.courseId ?? (courses.length > 0 ? courses[0].id : NEW_COURSE)
  );
  const [colour, setColour] = useState<CourseColour>(
    COURSE_COLOURS[courses.length % COURSE_COLOURS.length]
  );
  const [error, setError] = useState<string | null>(null);

  if (!cell) return null;

  const makingCourse = choice === NEW_COURSE;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cell) return;

    const form = new FormData(event.currentTarget);
    const room = String(form.get('room') ?? '').trim();
    const isLab = form.get('isLab') === 'on';

    if (makingCourse) {
      const code = String(form.get('code') ?? '').trim();
      const name = String(form.get('name') ?? '').trim();
      if (!code || !name) {
        setError('A new course needs both a code and a name.');
        return;
      }
      setError(null);
      onSave(cell, { courseId: null, newCourse: { code, name, colour }, room, isLab });
      return;
    }

    setError(null);
    onSave(cell, { courseId: choice, newCourse: null, room, isLab });
  }

  const day = weekdayName(cell.weekday).long;
  const when = `${cell.periodLabel} period · ${periodRange(cell.periodStartsAt, cell.periodEndsAt)}`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? `${existing.code} · ${day}` : `Add a class · ${day}`}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="font-mono text-12 text-muted">{when}</p>

        <Field label="Course">
          <Select
            name="courseId"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} · {course.name}
              </option>
            ))}
            <option value={NEW_COURSE}>
              {courses.length === 0 ? 'Add your first course…' : 'A course not on this list…'}
            </option>
          </Select>
        </Field>

        {makingCourse ? (
          <>
            <div className="flex gap-4">
              <Field label="Code" className="w-28 shrink-0">
                <Input name="code" required placeholder="CS201" autoComplete="off" />
              </Field>
              <Field label="Name" className="flex-1">
                <Input
                  name="name"
                  required
                  placeholder="Data Structures & Algorithms"
                  autoComplete="off"
                />
              </Field>
            </div>

            <Field label="Colour" hint="How this course is marked everywhere in the app.">
              <div className="flex flex-wrap gap-2 pt-1">
                {COURSE_COLOURS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={option}
                    aria-pressed={colour === option}
                    onClick={() => setColour(option)}
                    className={cx(
                      'flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-100',
                      colour === option ? 'border-ink' : 'border-border hover:bg-sunken'
                    )}
                  >
                    <span
                      style={{
                        ...courseDot(option),
                        width: 'var(--check-size)',
                        height: 'var(--check-size)',
                      }}
                    />
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : null}

        <div className="flex items-end gap-4">
          <Field label="Room" className="flex-1">
            <Input
              name="room"
              defaultValue={existing?.room ?? ''}
              placeholder="257"
              autoComplete="off"
            />
          </Field>

          <label className="flex h-(--control-height) items-center gap-2 text-14">
            <input
              type="checkbox"
              name="isLab"
              defaultChecked={existing?.isLab ?? false}
              className="h-(--check-size) w-(--check-size) accent-ink"
            />
            This is a lab
          </label>
        </div>

        {error ? <p className="text-13 text-accent">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy} className="flex-1">
            {busy ? 'Saving…' : existing ? 'Save' : 'Add class'}
          </Button>

          {existing ? (
            <Button type="button" disabled={busy} onClick={() => onRemove(cell)}>
              Remove
            </Button>
          ) : null}
        </div>

        {existing ? (
          <p className="text-12 text-muted">
            Removing a class drops the weekly slot and this term&rsquo;s remaining
            lectures for it. Lectures you have already written a note on, attached a
            file to, or that have already happened are kept.
          </p>
        ) : (
          <p className="text-12 text-muted">
            This adds the weekly slot and generates the rest of this term&rsquo;s
            lectures for it. Nothing you have already written on is touched.
          </p>
        )}
      </form>
    </Sheet>
  );
}
