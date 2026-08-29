import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
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
            description="Courses arrive with your timetable — click a cell there and name the course."
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
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-100 hover:bg-sunken"
                >
                  <span style={courseDot(colour)} />
                  <span className="shrink-0 font-mono text-12 font-medium">
                    {course.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-14">{course.name}</span>
                    <span className="block truncate text-12 text-muted">
                      {progressLabel(progress)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
