'use client';

// The timetable, drawn the way it is drawn on paper: numbered periods down the
// left, Monday to Friday across, and a blank cell for a free period.
//
// Every cell is a button. An empty one adds a class, a filled one edits it —
// which is the whole point of the screen, and the reason the fuller settings
// screens can wait for slice 17.
//
// The grid scrolls sideways inside its own container on a phone. The page body
// never does: five columns at their 116px floor is 672px, and a 390px screen
// gets the left-hand period column pinned so you always know which row you are
// reading.

import { useState, useTransition } from 'react';

import {
  ClassSheet,
  type ClassFormValues,
  type OpenCell,
  type SheetCourse,
} from '@/components/timetable/class-sheet';
import { courseRail, courseTint } from '@/lib/course-colours';
import {
  buildGrid,
  clockLabel,
  periodRange,
  weekdayName,
  WEEKDAYS,
  type TimetableClass,
  type TimetablePeriod,
} from '@/lib/timetable';

export type AddClassValues = {
  periodId: string;
  weekday: number;
  courseId: string | null;
  newCourse: { code: string; name: string; colour: string } | null;
  room: string;
  isLab: boolean;
};

export type UpdateClassValues = {
  sessionId: string;
  room: string;
  isLab: boolean;
  courseId: string | null;
};

type TimetableGridProps = {
  periods: TimetablePeriod[];
  classes: TimetableClass[];
  courses: SheetCourse[];
  addClass: (values: AddClassValues) => Promise<void>;
  updateClass: (values: UpdateClassValues) => Promise<void>;
  removeClass: (sessionId: string) => Promise<void>;
};

export function TimetableGrid(props: TimetableGridProps) {
  const [cell, setCell] = useState<OpenCell | null>(null);
  const [pending, startTransition] = useTransition();

  const { rows, unplaced } = buildGrid(props.periods, props.classes);

  function onSave(open: OpenCell, values: ClassFormValues) {
    startTransition(async () => {
      if (open.existing) {
        await props.updateClass({
          sessionId: open.existing.sessionId,
          room: values.room,
          isLab: values.isLab,
          courseId: values.courseId,
        });
      } else {
        await props.addClass({
          periodId: open.periodId,
          weekday: open.weekday,
          courseId: values.courseId,
          newCourse: values.newCourse,
          room: values.room,
          isLab: values.isLab,
        });
      }
      setCell(null);
    });
  }

  function onRemove(open: OpenCell) {
    if (!open.existing) return;
    const sessionId = open.existing.sessionId;
    startTransition(async () => {
      await props.removeClass(sessionId);
      setCell(null);
    });
  }

  return (
    <>
      {/* The one element allowed to scroll sideways. */}
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `var(--timetable-label-width) repeat(${WEEKDAYS.length}, minmax(var(--timetable-column-min), 1fr))`,
          }}
        >
          {/* Header row. The corner cell is sticky too, or it slides out from
              under the period column on a phone. */}
          <div className="sticky left-0 z-20 border-b border-line bg-sunken px-3 py-2">
            <span className="font-mono text-label text-faint uppercase">Period</span>
          </div>
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="border-b border-l border-line bg-sunken px-3 py-2 text-center"
            >
              <span className="font-mono text-label text-faint uppercase">
                <span className="sm:hidden">{weekdayName(weekday).short}</span>
                <span className="hidden sm:inline">{weekdayName(weekday).long}</span>
              </span>
            </div>
          ))}

          {rows.map((row) => {
            const period = row[0].period;
            return (
              <div key={period.id} className="contents">
                <div className="sticky left-0 z-10 flex min-h-(--timetable-row-height) flex-col justify-center border-b border-line bg-surface px-3">
                  <span className="font-mono text-14 font-medium">{period.label}</span>
                  <span className="font-mono text-12 whitespace-nowrap text-muted">
                    {periodRange(period.startsAt, period.endsAt)}
                  </span>
                </div>

                {row.map((slot) => (
                  <Cell
                    key={`${period.id}-${slot.weekday}`}
                    onOpen={(existing) =>
                      setCell({
                        periodId: period.id,
                        periodLabel: period.label,
                        periodStartsAt: period.startsAt,
                        periodEndsAt: period.endsAt,
                        weekday: slot.weekday,
                        existing,
                      })
                    }
                    classes={slot.classes}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {unplaced.length > 0 ? (
        <p className="mt-3 text-12 text-muted">
          {unplaced.length === 1 ? 'One class does' : `${unplaced.length} classes do`} not sit
          on this grid — a weekend slot, or a time that matches no period. They are still
          on the calendar.
        </p>
      ) : null}

      <ClassSheet
        // A fresh form per cell: the course, the colour and the room are all
        // about the cell that was clicked, and carrying them over is a bug.
        key={cell ? `${cell.periodId}|${cell.weekday}` : 'closed'}
        cell={cell}
        courses={props.courses}
        busy={pending}
        onClose={() => setCell(null)}
        onSave={onSave}
        onRemove={onRemove}
      />
    </>
  );
}

/**
 * One cell. Empty is a wide, quiet target — DESIGN.md's 44px minimum comes for
 * free at the row height — and filled is a class block built to the same rules
 * as the calendar's: a 3px rail, an 8% tint, and text in --text.
 */
function Cell({
  classes,
  onOpen,
}: {
  classes: TimetableClass[];
  onOpen: (existing: TimetableClass | null) => void;
}) {
  if (classes.length === 0) {
    return (
      <button
        type="button"
        aria-label="Add a class"
        onClick={() => onOpen(null)}
        className="group min-h-(--timetable-row-height) border-b border-l border-line transition-colors duration-100 hover:bg-sunken"
      >
        <span className="text-16 text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100">
          +
        </span>
      </button>
    );
  }

  return (
    <div className="flex min-h-(--timetable-row-height) flex-col gap-(--block-gap) border-b border-l border-line p-1">
      {classes.map((item) => (
        <button
          key={item.sessionId}
          type="button"
          onClick={() => onOpen(item)}
          style={{ ...courseRail(item.colour), ...courseTint(item.colour) }}
          className="flex flex-1 flex-col items-start justify-center gap-0.5 rounded-block px-(--block-pad-inline) py-(--block-pad-block) text-left transition-opacity duration-100 hover:opacity-80"
        >
          <span className="flex w-full items-center gap-1">
            <span className="min-w-0 flex-1 truncate font-mono text-12 font-medium">
              {item.code}
            </span>
            {item.isLab ? (
              <span className="shrink-0 font-mono text-label text-muted uppercase">Lab</span>
            ) : null}
          </span>

          <span className="w-full truncate text-12">{item.name}</span>

          <span className="w-full truncate font-mono text-12 text-muted">
            {item.room ?? clockLabel(item.startsAt)}
          </span>
        </button>
      ))}
    </div>
  );
}
