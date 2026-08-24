import Link from 'next/link';
import type { ReactNode } from 'react';

import { TaskCheck } from '@/components/tasks/task-check';
import { courseDot, type CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';

// One task in a list. A Server Component: the checkbox is a form, the source
// link is a link, and the only thing that needed a browser — the edit sheet —
// is passed in as a child so this file never becomes a client component.

type TaskItemProps = {
  id: string;
  title: string;
  done: boolean;
  /** True once it is past its due time and still open. Marked, never hidden. */
  overdue?: boolean;
  code: string | null;
  colour: CourseColour | null;
  /** 'Fri 28 Aug' or '17:00'. */
  due: string;
  /** Where the sentence this came from lives, when it came from one. */
  source?: { href: string; label: string } | null;
  toggle: (formData: FormData) => Promise<void>;
  /** The edit affordance, so the interactive part stays a leaf. */
  action?: ReactNode;
};

export function TaskItem({
  id,
  title,
  done,
  overdue = false,
  code,
  colour,
  due,
  source = null,
  toggle,
  action,
}: TaskItemProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <TaskCheck id={id} done={done} title={title} toggle={toggle} />

      <div className="min-w-0 flex-1">
        <p className={cx('text-14', done && 'text-muted line-through')}>{title}</p>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-12 text-faint">
          {colour ? <span style={courseDot(colour)} aria-hidden="true" /> : null}
          {code ? <span className="font-mono">{code}</span> : null}
          {source ? (
            <Link
              href={source.href}
              className="underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              from {source.label}
            </Link>
          ) : null}
        </p>
      </div>

      <span
        className={cx(
          'shrink-0 font-mono text-12',
          overdue ? 'text-accent' : 'text-muted'
        )}
      >
        {due}
      </span>

      {action}
    </li>
  );
}
