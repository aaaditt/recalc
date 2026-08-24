// The calendar's controls: move, jump to today, switch view, add a one-off.
//
// The view buttons carry one piece of cleverness that earns its keep. Before
// anyone has chosen a view, `view` is 'auto' — week on a laptop, day on a
// phone (docs/DESIGN.md). Which one is "current" is therefore a question about
// the viewport, and it is answered in CSS with a `md:` variant rather than in
// JavaScript, so the right button is highlighted on the first frame on either
// device and there is no flash and no guess during server rendering.

import { CALENDAR_VIEWS, type CalendarView, type CalendarViewChoice } from '@/lib/calendar';
import { cx } from '@/lib/cx';
import { Button } from '@/components/ui/button';

const LABEL: Record<CalendarView, string> = {
  week: 'Week',
  day: 'Day',
  month: 'Month',
};

/** The keyboard shortcut, shown in the button's tooltip. */
const KEY: Record<CalendarView, string> = { week: 'W', day: 'D', month: 'M' };

const CHOSEN = 'bg-sunken font-medium text-ink';
const IDLE = 'text-muted hover:bg-sunken hover:text-ink';

// 'auto' is week from 768px up and day below it. Spelled out in full: Tailwind
// finds class names by reading the source, so a class assembled at runtime is
// a class that never gets generated.
const AUTO: Record<CalendarView, string> = {
  week: 'md:bg-sunken md:font-medium md:text-ink max-md:text-muted max-md:hover:bg-sunken max-md:hover:text-ink',
  day: 'max-md:bg-sunken max-md:font-medium max-md:text-ink md:text-muted md:hover:bg-sunken md:hover:text-ink',
  month: IDLE,
};

function tabClass(view: CalendarViewChoice, target: CalendarView): string {
  if (view === 'auto') return AUTO[target];
  return view === target ? CHOSEN : IDLE;
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={back ? 'M12 4 6.5 10 12 16' : 'M8 4 13.5 10 8 16'} />
    </svg>
  );
}

export function CalendarToolbar({
  view,
  onView,
  onStep,
  onToday,
  onAdd,
}: {
  view: CalendarViewChoice;
  onView: (view: CalendarView) => void;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" aria-label="Previous" onClick={() => onStep(-1)}>
          <Chevron back />
        </Button>
        <Button onClick={onToday} title="Today (T)">
          Today
        </Button>
        <Button variant="ghost" aria-label="Next" onClick={() => onStep(1)}>
          <Chevron />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Calendar view"
          className="flex items-center gap-1 rounded-card border border-border bg-surface p-1"
        >
          {CALENDAR_VIEWS.map((target) => (
            <button
              key={target}
              type="button"
              role="tab"
              title={`${LABEL[target]} (${KEY[target]})`}
              onClick={() => onView(target)}
              className={cx(
                'h-(--control-height) rounded-card px-3 text-13 whitespace-nowrap transition-colors duration-100',
                tabClass(view, target)
              )}
            >
              {LABEL[target]}
            </button>
          ))}
        </div>

        <Button variant="primary" onClick={onAdd}>
          Add class
        </Button>
      </div>
    </div>
  );
}
