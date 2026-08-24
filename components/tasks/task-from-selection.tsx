'use client';

// "Make a task from this" — the sheet that opens when a sentence in a note is
// selected.
//
// It asks for as little as possible. The course and the lecture are already
// known by the page the note is on, and are filled in on the server, so the
// only decisions left here are the wording and when it is due.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';

export type SelectionTask = {
  /** The selected text, trimmed. */
  title: string;
  /** The block the selection sits in — the task's provenance. */
  blockId: string | null;
};

type TaskFromSelectionProps = {
  selection: SelectionTask | null;
  onClose: () => void;
  create: (input: {
    title: string;
    sourceBlockId: string | null;
    dueAt: string | null;
  }) => Promise<void>;
};

/** A sentence makes a long task title. Enough to recognise it, then stop. */
const MAX_TITLE = 200;

export function TaskFromSelection({ selection, onClose, create }: TaskFromSelectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selection === null) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const title = String(form.get('title') ?? '').trim();
    if (title === '') {
      setError('A task needs a title.');
      return;
    }

    const date = String(form.get('dueDate') ?? '');
    const time = String(form.get('dueTime') ?? '') || '23:59';

    setBusy(true);
    setError(null);
    try {
      await create({
        title,
        sourceBlockId: selection?.blockId ?? null,
        // Local, because the person choosing the date is sitting in their zone.
        dueAt: date === '' ? null : new Date(`${date}T${time}:00`).toISOString(),
      });
      onClose();
    } catch {
      setError('That did not save. The paragraph may not have been written yet — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Make a task from this">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Task" hint="Taken from what you selected. Shorten it if you like.">
          <Input
            name="title"
            required
            maxLength={MAX_TITLE}
            defaultValue={selection.title.slice(0, MAX_TITLE)}
            autoFocus
          />
        </Field>

        <div className="flex gap-4">
          <Field label="Due date" className="flex-1">
            <Input type="date" name="dueDate" />
          </Field>
          <Field label="Due time" className="flex-1">
            <Input type="time" name="dueTime" defaultValue="23:59" />
          </Field>
        </div>

        {error ? <p className="text-13 text-accent">{error}</p> : null}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add task'}
        </Button>

        <p className="text-12 text-muted">
          The task remembers the paragraph it came from, and links back to it.
        </p>
      </form>
    </Sheet>
  );
}
