'use client';

// One input for the whole flow: type "Thermo problem set fri 5pm", press enter,
// it is on the list with a deadline.
//
// 'use client' for two reasons and no others: the shorthand is parsed as you
// type, and what it understood is shown under the box before anything is saved
// (prompts/06-tasks.md — "if parsing is ambiguous, show what it understood
// before saving rather than guessing silently"). Parsing in the browser is also
// what makes the deadline land in the user's own timezone.

import { useMemo, useState, useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { parseTaskShorthand, shorthandDueAt } from '@/lib/task-shorthand';

export type QuickAddCourse = { id: string; code: string };

type QuickAddProps = {
  courses: QuickAddCourse[];
  add: (input: {
    title: string;
    courseId: string | null;
    dueAt: string | null;
  }) => Promise<void>;
};

/** 'Fri 28 Aug, 17:00' — what the parser understood, in words. */
function understoodLabel(date: string, time: string, timeWasTyped: boolean): string {
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`));

  return timeWasTyped ? `${when}, ${time}` : `${when}, end of day`;
}

export function QuickAdd({ courses, add }: QuickAddProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reparsed on every keystroke. It is a handful of regexes over a dozen
  // tokens — cheaper than the render it happens inside.
  const parsed = useMemo(
    () => parseTaskShorthand(value, { now: new Date(), courses }),
    [value, courses]
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parsed.title === '') {
      setError('A task needs a title.');
      return;
    }

    setError(null);
    const input = {
      title: parsed.title,
      courseId: parsed.courseId,
      dueAt: shorthandDueAt(parsed),
    };

    startTransition(async () => {
      try {
        await add(input);
        setValue('');
      } catch {
        setError('That did not save. Try again.');
      }
    });
  }

  const showsPreview = value.trim() !== '';

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Input
          name="quickAdd"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Thermo problem set fri 5pm"
          aria-label="Add a task"
          autoComplete="off"
          maxLength={200}
        />
        <Button type="submit" variant="primary" disabled={pending || parsed.title === ''}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {/* Never rendered on the server — `value` starts empty — so the clock
          this reads never causes a hydration mismatch. */}
      {showsPreview ? (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-13 text-muted">
          <span className="text-ink">{parsed.title || '(no title yet)'}</span>
          {parsed.courseCode ? (
            <span className="font-mono text-12">{parsed.courseCode}</span>
          ) : null}
          <span className="font-mono text-12">
            {parsed.dueDate === null
              ? 'no date'
              : understoodLabel(parsed.dueDate, parsed.dueTime, parsed.timeWasTyped)}
          </span>
        </p>
      ) : (
        <p className="text-12 text-muted">
          Add a day and a time on the end — <span className="font-mono">fri 5pm</span>,{' '}
          <span className="font-mono">tomorrow</span>,{' '}
          <span className="font-mono">28 aug 23:59</span> — or a course code anywhere in
          the line.
        </p>
      )}

      {error ? <p className="text-13 text-accent">{error}</p> : null}
    </form>
  );
}
