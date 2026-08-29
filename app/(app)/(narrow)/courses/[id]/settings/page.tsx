import Link from 'next/link';
import { notFound } from 'next/navigation';

import { removeCourseAction, updateCourseAction } from '../../actions';
import { ColourChoice } from '@/components/courses/colour-choice';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { colourForCourse, courseDot } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { getCourse, getCourses } from '@/modules/courses';
import { ensureWorkspace } from '@/modules/workspaces';

// Everything about a course that is not its syllabus.
//
// Slice 16 could only ever create a course inline from a grid cell — a code, a
// name and a colour — and the instructor, the credits and the term had nowhere
// to be typed except the Supabase table editor. This is that screen, and it is
// the last of docs/SEEDING.md's `courses` table to come inside the app.
//
// Plain <form>, Server Component, no JavaScript: the colour picker is eight
// native radios (components/courses/colour-choice.tsx), exactly as the syllabus
// rows are three submit buttons.

export const metadata = { title: 'Course settings · Recalc' };

export default async function CourseSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; kept?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const course = await getCourse(supabase, workspace.id, id);
  if (!course) notFound();

  // Courses come back ordered by code, so a course with no colour of its own
  // gets the same fallback here as it does everywhere else in the app.
  const courses = await getCourses(supabase, workspace.id);
  const colour = colourForCourse(
    course.colour,
    Math.max(
      courses.findIndex((entry) => entry.id === course.id),
      0
    )
  );

  const save = updateCourseAction.bind(null, course.id);
  const remove = removeCourseAction.bind(null, course.id);

  return (
    <>
      <header className="pb-4">
        <Link
          href={`/courses/${course.id}`}
          className="font-mono text-label text-faint uppercase underline-offset-4 hover:text-ink hover:underline"
        >
          ← {course.code}
        </Link>

        <div className="flex items-center gap-2 pt-3">
          <span style={courseDot(colour)} />
          <h1 className="text-26 font-semibold tracking-tight">Course settings</h1>
        </div>
      </header>

      {query.saved ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          Saved.
        </div>
      ) : null}

      {query.kept ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          <p className="font-medium">This course was not deleted.</p>
          <p className="mt-1">
            {query.kept} would have gone with it. Deleting a course deletes its lectures,
            and your notes hang off those. Correct its code and name instead.
          </p>
        </div>
      ) : null}

      <Card>
        <form action={save} className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Code" className="sm:w-32 sm:shrink-0">
              <Input
                name="code"
                required
                maxLength={20}
                defaultValue={course.code}
                autoComplete="off"
                className="font-mono"
              />
            </Field>
            <Field label="Name" className="flex-1">
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={course.name}
                autoComplete="off"
              />
            </Field>
          </div>

          <Field
            label="Colour"
            hint="How this course is marked on the calendar, the timetable and every list."
          >
            <ColourChoice name="colour" value={colour} />
          </Field>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Instructor" className="flex-1">
              <Input
                name="instructor"
                maxLength={120}
                defaultValue={course.instructor ?? ''}
                placeholder="Dr R. Menon"
                autoComplete="off"
              />
            </Field>
            <Field label="Credits" className="sm:w-28 sm:shrink-0">
              <Input
                type="number"
                name="credits"
                min={0}
                max={30}
                step="0.5"
                defaultValue={course.credits ?? ''}
                placeholder="3"
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="Term" hint="Free text, but be consistent — the code must be unique within it.">
            <Input
              name="term"
              required
              maxLength={60}
              defaultValue={course.term}
              autoComplete="off"
            />
          </Field>

          <div>
            <Button type="submit" variant="primary">
              Save course
            </Button>
          </div>
        </form>

        <CardDivider />

        <form action={remove} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-12 text-muted">
            Deleting a course deletes its weekly classes, its syllabus and its lectures.
            It is refused while anything is written against it — a note, a file, a task,
            or a lecture you have edited.
          </p>
          <Button type="submit">Delete course</Button>
        </form>
      </Card>

      <p className="pt-3 text-12 text-muted">
        The syllabus itself — the units, their order and how well you know them — is on{' '}
        <Link
          href={`/courses/${course.id}`}
          className="underline underline-offset-4"
        >
          the course page
        </Link>
        . Weekly class times are on{' '}
        <Link href="/timetable" className="underline underline-offset-4">
          the timetable
        </Link>
        .
      </p>
    </>
  );
}
