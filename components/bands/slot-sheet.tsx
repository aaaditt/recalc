// One slot inside a band: what it is, when it is, and optionally which course
// it belongs to.
//
// The course is optional and is the only field here that is not about time. It
// exists because docs/PRODUCT.md says to choose whatever gets closer to
// "3 hours on Unit 1 and 20 minutes on Unit 3", and an evening that names a
// course is the only part of this feature pointing that way. Today it buys the
// slot a rail and an 8% tint; nothing multiplies it by anything yet.

import { useState } from 'react';

import type { CourseOption } from '@/components/calendar/add-class-sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { weekdayName } from '@/lib/timetable';
import type { SaveResult } from '@/lib/timetable';

export type SlotFormValues = {
  label: string;
  courseId: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
};

export type OpenSlot = {
  /** Null when this is a new slot. */
  id: string | null;
  values: SlotFormValues;
};

type SlotSheetProps = {
  open: OpenSlot | null;
  /** The band's own frame, printed as the hint, because a slot has to fit it. */
  bandName: string;
  bandRange: string;
  courses: CourseOption[];
  busy: boolean;
  onClose: () => void;
  onSave: (values: SlotFormValues) => Promise<SaveResult>;
  onDelete?: () => Promise<SaveResult>;
};

export function SlotSheet({
  open,
  bandName,
  bandRange,
  courses,
  busy,
  onClose,
  onSave,
  onDelete,
}: SlotSheetProps) {
  // Seeded once, from props. A fresh form per cell is a `key` at the call site
  // — see components/bands/band-sheet.tsx and the sheet it borrows from.
  const [label, setLabel] = useState(open?.values.label ?? '');
  const [courseId, setCourseId] = useState(open?.values.courseId ?? '');
  const [startsAt, setStartsAt] = useState(open?.values.startsAt.slice(0, 5) ?? '');
  const [endsAt, setEndsAt] = useState(open?.values.endsAt.slice(0, 5) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  const editing = open.id !== null;

  async function save() {
    if (!open) return;
    setError(null);

    if (label.trim().length === 0) {
      setError('A slot needs a name.');
      return;
    }
    if (endsAt <= startsAt) {
      setError('A slot has to end after it starts.');
      return;
    }

    const result = await onSave({
      label: label.trim(),
      courseId: courseId === '' ? null : courseId,
      weekday: open.values.weekday,
      startsAt,
      endsAt,
    });
    if (result.ok) onClose();
    else setError(result.message);
  }

  async function remove() {
    if (!onDelete) return;
    setError(null);
    const result = await onDelete();
    if (result.ok) onClose();
    else setError(result.message);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${weekdayName(open.values.weekday).long} · ${bandName}`}
    >
      <div className="flex flex-col gap-4">
        <Field label="What" hint="“Gym”, “Study”, “Dinner”, “Commute home”.">
          <Input
            value={label}
            disabled={busy}
            placeholder="Gym"
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="From" className="flex-1">
            <Input
              type="time"
              value={startsAt}
              disabled={busy}
              step={300}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="To" className="flex-1">
            <Input
              type="time"
              value={endsAt}
              disabled={busy}
              step={300}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </div>

        <p className="font-mono text-12 text-faint tabular-nums">
          {bandName} runs {bandRange}
        </p>

        <Field
          label="Course"
          hint="Optional. Naming one gives the slot that course's colour."
        >
          <Select
            value={courseId}
            disabled={busy}
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

        {error ? <p className="text-13 text-accent">{error}</p> : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          {editing && onDelete ? (
            confirming ? (
              <div className="flex items-center gap-2">
                <Button onClick={remove} disabled={busy}>
                  Really remove
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
                Remove
              </Button>
            )
          ) : (
            <span />
          )}

          <Button variant="primary" onClick={save} disabled={busy}>
            {editing ? 'Save' : 'Add slot'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
