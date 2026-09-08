// One slot inside a band — 'Gym', 'Study · ME301', 'Dinner'.
//
// Drawn to the same rules as a class block (docs/DESIGN.md, "Class blocks"),
// because on the zoomed view the two sit side by side and a slot that looked
// like a different species would make the screen read as two apps.
//
// A slot that names a course gets that course's 3px rail and 8% tint. One that
// does not is neutral: a hairline and the sunken surface. Text is always in
// --text / --text-muted, never in the course colour.

import type { CSSProperties } from 'react';

import type { BandSlotView } from '@/lib/bands';
import { courseRail, courseTint } from '@/lib/course-colours';
import { cx } from '@/lib/cx';

type SlotBlockProps = {
  slot: BandSlotView;
  /** Under an hour there is only room for one line. */
  tight?: boolean;
  className?: string;
};

export function SlotBlock({ slot, tight = false, className }: SlotBlockProps) {
  const style: CSSProperties = {
    padding: 'var(--block-pad-block) var(--block-pad-inline)',
    ...(slot.colour ? { ...courseTint(slot.colour), ...courseRail(slot.colour) } : null),
  };

  return (
    <div
      style={style}
      className={cx(
        'flex h-full w-full flex-col overflow-hidden rounded-block text-left leading-tight',
        slot.colour ? null : 'border border-line bg-sunken',
        className
      )}
    >
      {tight ? (
        <p className="flex min-w-0 items-baseline gap-2 truncate">
          <span className="truncate text-12 font-medium">{slot.label}</span>
          {slot.code ? (
            <span className="shrink-0 font-mono text-12 text-muted">{slot.code}</span>
          ) : null}
        </p>
      ) : (
        <>
          <p className="truncate text-12 font-medium">{slot.label}</p>
          <p className="truncate font-mono text-12 text-muted tabular-nums">
            {slot.code ? `${slot.code} · ` : ''}
            {slot.startsAt.slice(0, 5)}–{slot.endsAt.slice(0, 5)}
          </p>
        </>
      )}
    </div>
  );
}
