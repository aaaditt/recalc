'use client';

// "Ask about this" — the sheet that opens when a sentence in a note is selected
// and the Ask button is pressed.
//
// The sibling of components/tasks/task-from-selection.tsx, and deliberately the
// same shape: it asks for one thing. What the question is about was decided by
// what was highlighted, and the page underneath fills in everything else on the
// server, so nothing here is a decision about courses, lectures or models.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';

export type QuestionSelection = {
  /** The highlighted words, so the sheet can show what this is about. */
  quote: string;
  /** Every top-level block the selection touched. At least one. */
  anchorBlockIds: string[];
};

type AskFromSelectionProps = {
  selection: QuestionSelection | null;
  onClose: () => void;
  ask: (input: { text: string; anchorBlockIds: string[] }) => Promise<void>;
};

/** Long enough for a real question, short enough that it stays one. */
const MAX_QUESTION = 500;

export function AskFromSelection({ selection, onClose, ask }: AskFromSelectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selection === null) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const text = String(form.get('text') ?? '').trim();
    if (text === '') {
      setError('A question has to say something.');
      return;
    }
    if (!selection || selection.anchorBlockIds.length === 0) {
      setError('Select something in the note first — a question has to be about a paragraph.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await ask({ text, anchorBlockIds: selection.anchorBlockIds });
      onClose();
    } catch {
      setError('That did not save. The paragraph may not have been written yet — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Ask about this">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <p className="pb-2 font-mono text-label text-faint uppercase">
            {selection.anchorBlockIds.length === 1
              ? 'The paragraph you selected'
              : `The ${selection.anchorBlockIds.length} paragraphs you selected`}
          </p>
          <p className="border-l-2 border-line pl-3 text-13 text-muted italic">
            {selection.quote}
          </p>
        </div>

        <Field
          label="Your question"
          hint="Asked now, answered when you press Answer. Nothing runs on its own."
        >
          <Textarea name="text" required rows={3} maxLength={MAX_QUESTION} autoFocus />
        </Field>

        {error ? <p className="text-13 text-accent">{error}</p> : null}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Asking…' : 'Ask'}
        </Button>

        <p className="text-12 text-muted">
          The question stays anchored to those paragraphs. Edit one later and its answer
          is flagged in Review, exactly like a summary.
        </p>
      </form>
    </Sheet>
  );
}
