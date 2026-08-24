// One deadline in the "due" list.
//
// A dot in the course colour, the title, and the time it is due. Overdue rows
// carry the date instead of the time, because "Sat 22 Aug" is the useful fact
// once something is late.

import { TaskCheck } from '@/components/tasks/task-check';
import { courseDot, type CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';

type TaskRowProps = {
  id: string;
  title: string;
  /** 'ME301', or null for a task that belongs to no course. */
  code: string | null;
  colour: CourseColour | null;
  /** 'HH:MM' normally; 'Sat 22 Aug' once it is late. */
  due: string;
  overdue?: boolean;
  /**
   * Server action behind the checkbox. prompts/06-tasks.md is explicit that
   * completing a task must be one tap from here, and a plain form is the
   * fewest moving parts that can be.
   */
  toggle: (formData: FormData) => Promise<void>;
};

export function TaskRow({
  id,
  title,
  code,
  colour,
  due,
  overdue = false,
  toggle,
}: TaskRowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <TaskCheck id={id} done={false} title={title} toggle={toggle} />

      {/* The slot is there whether or not the task has a course, so the titles
          line up down the list. */}
      <span aria-hidden="true" className="flex w-2 shrink-0 justify-center self-center">
        {colour ? <span style={courseDot(colour)} /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-14">{title}</p>
        {code ? <p className="font-mono text-12 text-faint">{code}</p> : null}
      </div>

      <span
        className={cx(
          'shrink-0 font-mono text-12',
          overdue ? 'text-accent' : 'text-muted'
        )}
      >
        {due}
      </span>
    </li>
  );
}
