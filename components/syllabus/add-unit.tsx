'use client';

// The box at the foot of the syllabus. Type, enter, type, enter — the whole
// point of prompts/08-syllabus.md's fifth item.
//
// 'use client' for one reason: keeping the cursor in the box after each unit is
// added. A plain <form> would post, navigate, and hand focus back to the top of
// the page, which turns typing in a fourteen-unit syllabus into fourteen
// reaches for the mouse.

import { useState, useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

type AddUnitProps = {
  courseId: string;
  /** How many units there already are, so the placeholder can count. */
  count: number;
  add: (courseId: string, title: string) => Promise<void>;
};

export function AddUnit({ courseId, count, add }: AddUnitProps) {
  const [value, setValue] = useState('');
  const [adding, startAdding] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = value.trim();
    if (title === '') return;

    // Cleared first, and the input is never disabled, so the next unit can be
    // typed while this one is still in flight.
    setValue('');
    startAdding(async () => {
      await add(courseId, title);
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-4 py-3">
      <Input
        value={value}
        aria-label="New unit"
        maxLength={200}
        placeholder={`Unit ${count + 1}`}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="primary" disabled={value.trim() === '' && !adding}>
        Add
      </Button>
    </form>
  );
}
