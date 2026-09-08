// The form behind every band: a name, two times, and the days it runs.
//
// It is reached three ways and is the same form in all three — a drag on the
// 24-hour view (which arrives pre-filled), the "New band" button beside it, and
// the pencil on /bands. Drag is an accelerator, never the only door: the button
// is a full 44px tap target on a touch screen and opens this sheet empty.
//
// A band drawn on a Tuesday is a Tuesday band until you tick more days.
// Guessing Monday-to-Friday from one gesture is the kind of helpfulness that
// has to be undone.

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cx } from '@/lib/cx';
import type { SaveResult } from '@/lib/timetable';

/** Monday first, because a week does. Sunday sits at the end where it reads. */
const DAYS = [
  { weekday: 1, short: 'Mon' },
  { weekday: 2, short: 'Tue' },
  { weekday: 3, short: 'Wed' },
  { weekday: 4, short: 'Thu' },
  { weekday: 5, short: 'Fri' },
  { weekday: 6, short: 'Sat' },
  { weekday: 0, short: 'Sun' },
];

export type BandFormValues = {
  name: string;
  startsAt: string;
  endsAt: string;
  weekdays: number[];
};

export type OpenBand = {
  /** Null when this is a new band. */
  id: string | null;
  /** The university band's name and kind are fixed; only its frame is editable. */
  kind: 'custom' | 'university';
  values: BandFormValues;
};

type BandSheetProps = {
  open: OpenBand | null;
  busy: boolean;
  onClose: () => void;
  onSave: (values: BandFormValues) => Promise<SaveResult>;
  onDelete?: () => Promise<SaveResult>;
};

export function BandSheet({ open, busy, onClose, onSave, onDelete }: BandSheetProps) {
  // Seeded once, from props, and never synchronised afterwards. A fresh form
  // per band is a `key` at the call site — the same arrangement
  // components/timetable/class-sheet.tsx uses — because carrying the last
  // band's times into the next one is a bug, and an effect that copies props
  // into state is a cascade of renders to achieve the same thing.
  const [name, setName] = useState(open?.values.name ?? '');
  const [startsAt, setStartsAt] = useState(open?.values.startsAt.slice(0, 5) ?? '18:00');
  const [endsAt, setEndsAt] = useState(open?.values.endsAt.slice(0, 5) ?? '21:00');
  const [weekdays, setWeekdays] = useState<number[]>(open?.values.weekdays ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  const editing = open.id !== null;
  const university = open.kind === 'university';

  function toggleDay(weekday: number) {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday].sort((a, b) => a - b)
    );
  }

  async function save() {
    setError(null);

    if (!university && name.trim().length === 0) {
      setError('A band needs a name.');
      return;
    }
    if (weekdays.length === 0) {
      setError('Pick at least one day it runs.');
      return;
    }
    if (endsAt <= startsAt) {
      setError('A band has to end after it starts.');
      return;
    }

    const result = await onSave({ name: name.trim(), startsAt, endsAt, weekdays });
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
      title={editing ? open.values.name || 'Band' : 'New band'}
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          hint={
            university
              ? 'The university band is drawn from your timetable, so its name stays put.'
              : 'What this part of your day is. “Evening”, “Gym”, “Weekend”.'
          }
        >
          <Input
            value={name}
            disabled={university || busy}
            placeholder="Evening"
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
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

        <Field
          label="Runs on"
          hint="Two bands cannot cover the same minute of the same day."
        >
          <div className="flex flex-wrap gap-1 pt-1">
            {DAYS.map((day) => {
              const on = weekdays.includes(day.weekday);
              return (
                <button
                  key={day.weekday}
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => toggleDay(day.weekday)}
                  className={cx(
                    'h-(--control-height) min-w-11 rounded-card border px-2 text-13',
                    'transition-colors duration-100 disabled:opacity-50',
                    on
                      ? 'border-ink bg-ink text-bg'
                      : 'border-border bg-surface text-muted hover:bg-sunken hover:text-ink'
                  )}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        </Field>

        {error ? <p className="text-13 text-accent">{error}</p> : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          {editing && onDelete ? (
            confirming ? (
              <div className="flex items-center gap-2">
                <Button onClick={remove} disabled={busy}>
                  Really delete
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
                Delete
              </Button>
            )
          ) : (
            <span />
          )}

          <Button variant="primary" onClick={save} disabled={busy}>
            {editing ? 'Save' : 'Create band'}
          </Button>
        </div>

        {editing && university ? (
          <p className="text-12 text-muted">
            Deleting this band removes the frame and nothing else. Every lecture, note
            and file stays exactly where it is — the timetable does not read this.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
