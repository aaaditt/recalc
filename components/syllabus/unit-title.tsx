'use client';

// A unit's title, editable where it sits. 'use client' for one reason: knowing
// when the typing stopped. Everything else on the row — the status chip, the
// two arrows — is a plain <form> and needs no JavaScript at all.
//
// prompts/08-syllabus.md: "I will be typing my syllabus in from a PDF, so make
// this fast and boring." Fixing a typo should not mean opening a sheet.

import { useState, useTransition } from 'react';

import { cx } from '@/lib/cx';

type UnitTitleProps = {
  unitId: string;
  title: string;
  /** Bound to the course on the page; the module re-checks both ids. */
  rename: (unitId: string, title: string) => Promise<void>;
};

export function UnitTitle({ unitId, title, rename }: UnitTitleProps) {
  const [value, setValue] = useState(title);
  const [saving, startSaving] = useTransition();

  // Saved on blur and on Enter, and only when the words actually changed —
  // tabbing through a syllabus must not write fifteen identical rows.
  function commit() {
    const next = value.trim();
    if (next === '' || next === title) {
      setValue(title);
      return;
    }
    startSaving(async () => {
      await rename(unitId, next);
    });
  }

  return (
    <input
      value={value}
      aria-label="Unit title"
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setValue(title);
          event.currentTarget.blur();
        }
      }}
      className={cx(
        'h-(--control-height) w-full min-w-0 rounded-card border border-transparent',
        'bg-transparent px-2 text-14 text-ink outline-none transition-colors duration-100',
        'hover:border-border focus:border-ink',
        saving && 'opacity-50'
      )}
    />
  );
}
