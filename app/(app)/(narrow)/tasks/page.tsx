import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  addTaskAction,
  deleteTaskAction,
  toggleTaskDoneAction,
  updateTaskAction,
} from './actions';
import { QuickAdd } from '@/components/tasks/quick-add';
import { TaskEdit, type TaskEditUnit } from '@/components/tasks/task-edit';
import { TaskItem } from '@/components/tasks/task-item';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse, type CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';
import { createClient } from '@/lib/supabase/server';
import {
  TASK_FILTERS,
  courseFromParam,
  dayHeading,
  dueLabel,
  filterFromParam,
  filterTasks,
  groupTasks,
  isOverdue,
} from '@/lib/tasks';
import { localDateKey, localTimeLabel, localTimeZone, todayIn } from '@/lib/time';
import { getCourses, getSyllabusUnits } from '@/modules/courses';
import { getNoteRefs } from '@/modules/notes';
import { getTasks, type Task } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// Every deadline I have, in one place — prompts/06-tasks.md: "nothing lives in
// my phone's Notes app anymore".
//
// Server-rendered, filters as links: a filter is a fact about the URL, so it
// survives a refresh, can be bookmarked, and needs no JavaScript. The whole
// list is fetched once and filtered by a pure function, which is cheap at the
// size a single student's task list ever reaches and keeps the arithmetic in
// lib/tasks.ts where it has tests.

export const metadata = { title: 'Tasks · Recalc' };

type CourseLook = { code: string; name: string; colour: CourseColour };

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="pb-3 font-mono text-label text-faint uppercase">{children}</p>;
}

function GroupHeading({ label, tone }: { label: string; tone?: 'accent' }) {
  return (
    <p
      className={
        tone === 'accent'
          ? 'bg-accent-bg px-4 py-2 text-13 font-medium text-accent'
          : 'bg-sunken px-4 py-2 text-13 font-medium text-muted'
      }
    >
      {label}
    </p>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; c?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already redirects a signed-out visitor; this is only so the rest
  // of the function can assume a user.
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);

  const zone = localTimeZone();
  const today = todayIn(zone);
  const now = new Date();

  const [courses, allTasks] = await Promise.all([
    getCourses(supabase, workspace.id),
    getTasks(supabase, workspace.id),
  ]);

  // Courses come back ordered by code, so a course with no colour of its own
  // gets a stable one from the palette — the same answer /today gives.
  const look = new Map<string, CourseLook>();
  courses.forEach((course, index) => {
    look.set(course.id, {
      code: course.code,
      name: course.name,
      colour: colourForCourse(course.colour, index),
    });
  });

  const units: TaskEditUnit[] = (
    await Promise.all(
      courses.map(async (course) =>
        (await getSyllabusUnits(supabase, course.id)).map((unit) => ({
          id: unit.id,
          courseId: course.id,
          title: unit.title,
        }))
      )
    )
  ).flat();

  const filter = filterFromParam(params.f);
  const courseId = courseFromParam(
    params.c,
    courses.map((course) => course.id)
  );

  const shown = filterTasks(allTasks, { filter, courseId, now, today, timeZone: zone });
  const groups = groupTasks(shown, { now, timeZone: zone });

  // Where each task came from, when it came from a sentence in a note. One
  // batched lookup for the page rather than one per row.
  const sourceRefs = await getNoteRefs(
    supabase,
    workspace.id,
    shown.flatMap((task) => (task.source_block_id ? [task.source_block_id] : []))
  );

  function row(task: Task) {
    const course = task.course_id ? look.get(task.course_id) : undefined;
    const ref = task.source_block_id ? sourceRefs.get(task.source_block_id) : undefined;
    const done = task.status === 'done' || task.status === 'dropped';

    return (
      <TaskItem
        key={task.id}
        id={task.id}
        title={task.title}
        done={done}
        overdue={isOverdue(task, now)}
        code={course?.code ?? null}
        colour={course?.colour ?? null}
        due={dueLabel(task.due_at, { today, timeZone: zone })}
        source={
          ref
            ? { href: ref.href, label: ref.meetingId ? 'a lecture note' : ref.title || 'a note' }
            : null
        }
        toggle={toggleTaskDoneAction}
        action={
          <TaskEdit
            today={today}
            courses={courses.map((course) => ({
              id: course.id,
              code: course.code,
              name: course.name,
            }))}
            units={units}
            save={updateTaskAction}
            remove={deleteTaskAction}
            task={{
              id: task.id,
              title: task.title,
              notes: task.notes,
              courseId: task.course_id,
              unitId: task.unit_id,
              status: task.status,
              dueDate: task.due_at ? localDateKey(new Date(task.due_at), zone) : '',
              dueTime: task.due_at
                ? localTimeLabel(new Date(task.due_at), zone)
                : '23:59',
            }}
          />
        }
      />
    );
  }

  /** A filter chip keeps whatever course is already selected, and vice versa. */
  function hrefFor(next: { f?: string; c?: string | null }) {
    const query = new URLSearchParams();
    const wantedFilter = next.f ?? filter;
    const wantedCourse = next.c === undefined ? courseId : next.c;
    if (wantedFilter !== 'open') query.set('f', wantedFilter);
    if (wantedCourse) query.set('c', wantedCourse);
    const search = query.toString();
    return search === '' ? '/tasks' : `/tasks?${search}`;
  }

  const chip =
    'flex h-(--control-height) items-center rounded-full px-3 text-13 transition-colors duration-100';
  const chipOn = 'bg-ink font-medium text-bg';
  const chipOff = 'border border-border bg-surface text-muted hover:bg-sunken hover:text-ink';

  const liveCount = allTasks.filter(
    (task) => task.status !== 'done' && task.status !== 'dropped'
  ).length;
  const empty =
    groups.overdue.length === 0 &&
    groups.days.length === 0 &&
    groups.undated.length === 0 &&
    groups.finished.length === 0;

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          liveCount === 0 ? 'Nothing open.' : `${liveCount} open`
        }
      />

      <section className="pt-2">
        <SectionLabel>Add</SectionLabel>
        <Card className="p-4">
          <QuickAdd
            add={addTaskAction}
            courses={courses.map((course) => ({ id: course.id, code: course.code }))}
          />
        </Card>
      </section>

      <section className="pt-8">
        <SectionLabel>Show</SectionLabel>

        <div className="flex flex-wrap gap-2">
          {TASK_FILTERS.map((option) => (
            <Link
              key={option.value}
              href={hrefFor({ f: option.value })}
              aria-current={option.value === filter ? 'true' : undefined}
              className={cx(chip, option.value === filter ? chipOn : chipOff)}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {courses.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={hrefFor({ c: null })}
              className={cx(chip, courseId === null ? chipOn : chipOff)}
            >
              Every course
            </Link>
            {courses.map((course) => (
              <Link
                key={course.id}
                href={hrefFor({ c: course.id })}
                className={cx(chip, courseId === course.id ? chipOn : chipOff)}
              >
                <span className="font-mono text-12">{course.code}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="pt-6">
        <Card className="overflow-hidden">
          {empty ? (
            <EmptyState
              title={
                allTasks.length === 0 ? 'No tasks yet' : 'Nothing matches that filter'
              }
              description={
                allTasks.length === 0
                  ? 'Type one into the box above — a day and a time on the end is enough to give it a deadline.'
                  : 'Try another filter, or add the deadline you came here for.'
              }
            />
          ) : (
            <>
              {groups.overdue.length > 0 ? (
                <>
                  <GroupHeading label={`Overdue · ${groups.overdue.length}`} tone="accent" />
                  <ul aria-label="Overdue" className="divide-y divide-line">
                    {groups.overdue.map(row)}
                  </ul>
                </>
              ) : null}

              {groups.days.map((day, index) => (
                <div key={day.date}>
                  {index > 0 || groups.overdue.length > 0 ? <CardDivider /> : null}
                  <GroupHeading label={dayHeading(day.date, today)} />
                  <ul
                    aria-label={dayHeading(day.date, today)}
                    className="divide-y divide-line"
                  >
                    {day.tasks.map(row)}
                  </ul>
                </div>
              ))}

              {groups.undated.length > 0 ? (
                <div>
                  {groups.overdue.length > 0 || groups.days.length > 0 ? (
                    <CardDivider />
                  ) : null}
                  <GroupHeading label="No date" />
                  <ul aria-label="No date" className="divide-y divide-line">
                    {groups.undated.map(row)}
                  </ul>
                </div>
              ) : null}

              {groups.finished.length > 0 ? (
                <div>
                  {groups.overdue.length > 0 ||
                  groups.days.length > 0 ||
                  groups.undated.length > 0 ? (
                    <CardDivider />
                  ) : null}
                  <GroupHeading label={`Done · ${groups.finished.length}`} />
                  <ul aria-label="Done" className="divide-y divide-line">
                    {groups.finished.map(row)}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </section>
    </>
  );
}
