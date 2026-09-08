'use client';

// One band's own week: the days it runs across the top, its own hours down the
// side, and a slot in every cell you have decided something about.
//
// The same shape as /timetable, deliberately. That screen is the university
// band's inside; this is every other band's, and two screens that do the same
// job should not look like two different apps. What differs is the left-hand
// column — periods there, clock hours here, because a band has no numbered rows
// on a printed sheet to borrow.
//
// An empty cell is a button that adds a slot. A filled one edits it. That is
// the whole screen.

import { useState, useTransition } from 'react';

import { SlotBlock } from '@/components/calendar/slot-block';
import { SlotSheet, type OpenSlot, type SlotFormValues } from '@/components/bands/slot-sheet';
import type { CourseOption } from '@/components/calendar/add-class-sheet';
import {
  bandRangeLabel,
  bandSpan,
  clockAt,
  clockMinutes,
  hoursOfBand,
  type BandView,
} from '@/lib/bands';
import { formatHour, hoursIn } from '@/lib/calendar';
import { cx } from '@/lib/cx';
import { weekdayName, type SaveResult } from '@/lib/timetable';

type BandGridProps = {
  band: BandView;
  courses: CourseOption[];
  addSlot: (values: SlotFormValues) => Promise<SaveResult>;
  updateSlot: (slotId: string, values: SlotFormValues) => Promise<SaveResult>;
  removeSlot: (slotId: string) => Promise<SaveResult>;
};

export function BandGrid({ band, courses, addSlot, updateSlot, removeSlot }: BandGridProps) {
  const [open, setOpen] = useState<OpenSlot | null>(null);
  const [pending, startTransition] = useTransition();

  const hours = hoursOfBand(band);
  const hourMarks = hoursIn(hours);
  const gridStartMinute = hours.startHour * 60;
  const gridMinutes = (hours.endHour - hours.startHour) * 60;

  const span = bandSpan(band);
  const days = [...band.weekdays].sort((a, b) => a - b);

  /** Clamp a proposed hour into the band, so a new slot is never born invalid. */
  function slotAt(hour: number): { startsAt: string; endsAt: string } {
    const from = Math.max(span.startMinute, Math.min(hour * 60, span.endMinute - 30));
    const to = Math.min(span.endMinute, from + 60);
    return { startsAt: clockAt(from), endsAt: clockAt(to) };
  }

  function save(values: SlotFormValues): Promise<SaveResult> {
    const slotId = open?.id ?? null;
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(slotId ? await updateSlot(slotId, values) : await addSlot(values));
      });
    });
  }

  function remove(): Promise<SaveResult> {
    const slotId = open?.id;
    if (!slotId) return Promise.resolve({ ok: true });
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(await removeSlot(slotId));
      });
    });
  }

  return (
    <>
      {/* Scrolls sideways inside its own container on a phone; the page body
          never does. The same rule the timetable grid follows. */}
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `var(--week-gutter-width) repeat(${days.length}, minmax(var(--timetable-column-min), 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="border-b border-line" />
          {days.map((weekday) => (
            <div
              key={weekday}
              className="border-b border-l border-line px-2 py-2 text-13 font-medium"
            >
              {weekdayName(weekday).short}
            </div>
          ))}

          {/* The time gutter */}
          <div>
            {hourMarks.map((hour, index) => (
              <div
                key={hour}
                className={cx('h-(--day-hour-height)', index > 0 && 'border-t border-line')}
              >
                <span className="pl-2 font-mono text-12 text-faint tabular-nums">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* One column per day the band runs */}
          {days.map((weekday) => {
            const slots = band.slots
              .filter((slot) => slot.weekday === weekday)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

            return (
              <div key={weekday} className="relative border-l border-line">
                {hourMarks.map((hour, index) => (
                  <button
                    key={hour}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setOpen({
                        id: null,
                        values: { label: '', courseId: null, weekday, ...slotAt(hour) },
                      })
                    }
                    aria-label={`Add a slot on ${weekdayName(weekday).long} at ${formatHour(hour)}`}
                    className={cx(
                      'block h-(--day-hour-height) w-full transition-colors duration-100',
                      'hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                      index > 0 && 'border-t border-line'
                    )}
                  />
                ))}

                {slots.map((slot) => {
                  const from = clockMinutes(slot.startsAt);
                  const to = clockMinutes(slot.endsAt);

                  return (
                    <div
                      key={slot.id}
                      className="absolute inset-x-0 px-1"
                      style={{
                        top: `${((from - gridStartMinute) / gridMinutes) * 100}%`,
                        height: `${((to - from) / gridMinutes) * 100}%`,
                      }}
                    >
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          setOpen({
                            id: slot.id,
                            values: {
                              label: slot.label,
                              courseId: slot.courseId,
                              weekday: slot.weekday,
                              startsAt: slot.startsAt,
                              endsAt: slot.endsAt,
                            },
                          })
                        }
                        aria-label={`Edit ${slot.label}`}
                        className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <SlotBlock slot={slot} tight={to - from < 60} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <SlotSheet
        // A fresh form per cell. A new slot's key carries the cell it was
        // opened from, so clicking 18:00 and then 20:00 does not reuse 18:00.
        key={open ? (open.id ?? `new-${open.values.weekday}-${open.values.startsAt}`) : 'closed'}
        open={open}
        bandName={band.name}
        bandRange={bandRangeLabel(band)}
        courses={courses}
        busy={pending}
        onClose={() => setOpen(null)}
        onSave={save}
        onDelete={open?.id ? remove : undefined}
      />
    </>
  );
}
