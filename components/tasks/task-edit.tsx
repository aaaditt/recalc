'use client';

// Edit one task: retitle it, move it to another course or unit, reschedule it,
// change its status, or delete it.
//
// 'use client' for one reason: a sheet has to open and close. Everything inside
// it is a plain <form> posting to a server action, so the fields, the dates and
// the delete all work the way the rest of the app's forms do.

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { shiftDate, type CalendarDate } from '@/lib/time';

export type TaskEditCourse = { id: string; code: string; name: string };
export type TaskEditUnit = { id: string; courseId: string; title: string };

export type EditableTask = {
  id: string;
  title: string;
  notes: string | null;
  courseId: string | null;
  unitId: string | null;
  status: string;
  /** The local day it is due, or '' for undated. */
  dueDate: CalendarDate | '';
  /** 'HH:MM' local. */
  dueTime: string;
};

type TaskEditProps = {
  task: EditableTask;
  courses: TaskEditCourse[];
  units: TaskEditUnit[];
  /** Today, in the user's zone — the anchor for the quick reschedule buttons. */
  today: CalendarDate;
  save: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
};

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
];

export function TaskEdit({ task, courses, units, today, save, remove }: TaskEditProps) {
  const [open, setOpen] = useState(false);
  // Controlled so the quick reschedule buttons have something to write into.
  const [dueDate, setDueDate] = useState<string>(task.dueDate);
  const [courseId, setCourseId] = useState<string>(task.courseId ?? '');

  // A unit belongs to exactly one course, so the list follows the picker above
  // it. The server checks this again — the browser is not what enforces it.
  const courseUnits = units.filter((unit) => unit.courseId === courseId);

  const quickDates: { label: string; date: CalendarDate }[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: shiftDate(today, 1) },
    { label: 'Next week', date: shiftDate(today, 7) },
  ];

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${task.title}`}
        className="px-2"
      >
        Edit
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Edit task">
        <form
          action={async (formData) => {
            await save(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={task.id} />

          <Field label="Title">
            <Input name="title" required defaultValue={task.title} maxLength={200} />
          </Field>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Due date" className="flex-1">
              <Input
                type="date"
                name="dueDate"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
            <Field label="Due time" className="flex-1">
              <Input
                type="time"
                name="dueTime"
                defaultValue={task.dueTime}
                disabled={dueDate === ''}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickDates.map((quick) => (
              <Button
                key={quick.label}
                variant="secondary"
                onClick={() => setDueDate(quick.date)}
                className="px-3"
              >
                {quick.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setDueDate('')} className="px-3">
              No date
            </Button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Course" className="flex-1">
              <Select
                name="courseId"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              >
                <option value="">No course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {course.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Unit" className="flex-1">
              <Select
                name="unitId"
                defaultValue={task.unitId ?? ''}
                disabled={courseUnits.length === 0}
                key={courseId}
              >
                <option value="">No unit</option>
                {courseUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Status">
            <Select name="status" defaultValue={task.status}>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" hint="Anything you would otherwise forget by Thursday.">
            <Textarea name="notes" defaultValue={task.notes ?? ''} maxLength={2000} />
          </Field>

          <Button type="submit" variant="primary">
            Save
          </Button>
        </form>

        <form
          action={async (formData) => {
            await remove(formData);
            setOpen(false);
          }}
          className="pt-4"
        >
          <input type="hidden" name="id" value={task.id} />
          <Button type="submit" variant="ghost" className="px-2 text-accent">
            Delete this task
          </Button>
          <p className="pt-1 text-12 text-muted">
            Deleting is for a task that was never real. Something you decided not to do is{' '}
            <em>dropped</em> — it keeps its history.
          </p>
        </form>
      </Sheet>
    </>
  );
}
