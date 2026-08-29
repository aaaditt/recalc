import Link from 'next/link';

import { addCourseAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse, courseDot } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { courseProgress, progressLabel, rollUpUnits } from '@/lib/syllabus';
import { localTimeZone } from '@/lib/time';
import { getCourses, getSyllabusUnits } from '@/modules/courses';
import { getUnitStudy } from '@/modules/study';
import { getTasks } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// The way in to a course's syllabus. One line per course and nothing else —
// docs/DESIGN.md's "what not to build" rules out a dashboard, and the honest
// progress line is the only number a course list has any business showing.

export const metadata = { title: 'Courses · Recalc' };

export default async function CoursesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const zone = localTimeZone();

  const [courses, study, tasks] = await Promise.all([
    getCourses(supabase, workspace.id),
    getUnitStudy(supabase, workspace.id, zone),
    getTasks(supabase, workspace.id),
  ]);

  const taskLinks = tasks.map((task) => ({ unitId: task.unit_id, status: task.status }));

  const rows = await Promise.all(
    courses.map(async (course, index) => {
      const units = await getSyllabusUnits(supabase, course.id);
      const rolled = rollUpUnits(
        units.map((unit) => ({
          id: unit.id,
          title: unit.title,
          position: unit.position,
          status: unit.status,
        })),
        // Notes are left out on purpose: this page shows progress, and a note
        // attached to a unit does not make it covered. The course page counts
        // them where they can actually be opened.
        { study, notes: [], tasks: taskLinks }
      );

      return {
        course,
        colour: colourForCourse(course.colour, index),
        progress: courseProgress(rolled),
      };
    })
  );

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle="Your syllabus, in order, and what you have actually covered."
        actions={
          <>
            <Link
              href="/timetable"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Timetable
            </Link>
            <Link
              href="/settings/semester"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Semester
            </Link>
          </>
        }
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="Add one here, or click a cell on the timetable and name the course as you place it."
            action={
              <Link
                href="/timetable"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Fill in your timetable
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ course, colour, progress }) => (
              <li key={course.id} className="flex items-center gap-3 px-4 py-3">
                <Link
                  href={`/courses/${course.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span style={courseDot(colour)} />
                  <span className="shrink-0 font-mono text-12 font-medium">
                    {course.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-14">{course.name}</span>
                    <span className="block truncate text-12 text-muted">
                      {course.instructor ? `${course.instructor} · ` : ''}
                      {progressLabel(progress)}
                    </span>
                  </span>
                </Link>

                <Link
                  href={`/courses/${course.id}/settings`}
                  className="shrink-0 text-12 text-muted underline underline-offset-4 hover:text-ink"
                >
                  Settings
                </Link>
              </li>
            ))}
          </ul>
        )}

        <CardDivider />

        {/* A course with no weekly class at all — a project, a reading course —
            still needs a syllabus and somewhere for its notes to hang, so it
            has to be possible to make one without inventing a grid cell. */}
        <form
          action={addCourseAction}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end"
        >
          <Field label="Code" className="sm:w-28 sm:shrink-0">
            <Input
              name="code"
              required
              maxLength={20}
              placeholder="CS201"
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <Field label="Name" className="flex-1">
            <Input
              name="name"
              required
              maxLength={120}
              placeholder="Data Structures & Algorithms"
              autoComplete="off"
            />
          </Field>
          <Button type="submit" variant="primary">
            Add course
          </Button>
        </form>
      </Card>

      <p className="pt-3 text-12 text-muted">
        A new course lands on its settings screen, where its colour, instructor and
        credits are. Its weekly classes are added on{' '}
        <Link href="/timetable" className="underline underline-offset-4">
          the timetable
        </Link>
        .
      </p>
    </>
  );
}
