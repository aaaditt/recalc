import Link from 'next/link';

import {
  addClassAction,
  removeClassAction,
  setTermAction,
  updateClassAction,
} from './actions';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import type { TimetableClass } from '@/lib/timetable';
import { getTimetable } from '@/modules/timetable';
import { ensureWorkspace } from '@/modules/workspaces';

// The timetable, as periods rather than clock hours — the shape it is written
// in on paper (last_sem.jpeg).
//
// It is not a second calendar and there is no second set of data behind it. The
// rows are `periods`, the filled cells are `sessions`, and adding one generates
// the same `class_meetings` the calendar has always rendered. What this screen
// replaces is docs/SEEDING.md's trip to the Supabase table editor.

export const metadata = { title: 'Timetable · Recalc' };

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const { periods, courses, sessions } = await getTimetable(supabase, workspace.id);

  // Courses come back ordered by code, so one without a colour of its own gets
  // a stable one from the palette — the same rule the calendar uses.
  const look = new Map(
    courses.map((course, index) => [
      course.id,
      {
        code: course.code,
        name: course.name,
        colour: colourForCourse(course.colour, index),
      },
    ])
  );

  const classes: TimetableClass[] = sessions.map((session) => {
    const course = look.get(session.course_id);
    return {
      sessionId: session.id,
      courseId: session.course_id,
      code: course?.code ?? '—',
      name: course?.name ?? 'Unknown course',
      colour: course?.colour ?? 'indigo',
      room: session.room,
      isLab: session.is_lab,
      weekday: session.weekday,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      periodId: session.period_id,
    };
  });

  const termSet = Boolean(workspace.term_start && workspace.term_end);

  return (
    // Wider than the reading column: five day columns need the room, exactly
    // as the calendar does.
    <div className="mx-auto w-full max-w-(--page-width-wide)">
      <PageHeader
        title="Timetable"
        subtitle={
          classes.length === 0
            ? 'Click any empty cell to put a class in it.'
            : `${classes.length} classes a week.`
        }
        actions={
          <>
            <Link
              href="/calendar"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Calendar
            </Link>
            <Link
              href="/timetable/periods"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Periods
            </Link>
            <Link
              href="/courses"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Courses
            </Link>
          </>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {/* The term. Two dates, once, and every class added afterwards knows how
          far to expand itself. Until they are set the grid still works — the
          weekly slot is saved, there is just nothing dated to make from it. */}
      <Card className="mb-4">
        <form
          action={setTermAction}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end"
        >
          <Field label="Term starts" className="flex-1">
            <Input
              type="date"
              name="termStart"
              defaultValue={workspace.term_start ?? undefined}
            />
          </Field>
          <Field label="Term ends" className="flex-1">
            <Input type="date" name="termEnd" defaultValue={workspace.term_end ?? undefined} />
          </Field>
          <Button type="submit" variant={termSet ? 'secondary' : 'primary'}>
            Save term
          </Button>
        </form>

        {termSet ? null : (
          <p className="border-t border-line px-4 py-3 text-12 text-muted">
            Set the term and adding a class also generates its lectures, all the way to
            the last day. Without it a class is only a weekly slot.
          </p>
        )}
      </Card>

      <TimetableGrid
        periods={periods.map((period) => ({
          id: period.id,
          label: period.label,
          startsAt: period.starts_at,
          endsAt: period.ends_at,
        }))}
        classes={classes}
        courses={courses.map((course) => ({
          id: course.id,
          code: course.code,
          name: course.name,
        }))}
        addClass={addClassAction}
        updateClass={updateClassAction}
        removeClass={removeClassAction}
      />

      <p className="mt-3 text-12 text-muted">
        Free periods are blank. A filled cell opens for editing; removing one keeps every
        lecture you have written a note on. The row headings and their times are on{' '}
        <Link href="/timetable/periods" className="underline underline-offset-4">
          Periods
        </Link>
        , and{' '}
        <Link href="/settings/semester" className="underline underline-offset-4">
          regenerating the whole term
        </Link>{' '}
        is there if you have changed several at once.
      </p>
    </div>
  );
}
