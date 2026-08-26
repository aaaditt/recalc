import Link from 'next/link';

import { logStudySessionAction, setFocusRatingAction } from './actions';
import {
  FocusTimer,
  type FocusCourse,
  type FocusUnit,
} from '@/components/focus/focus-timer';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse } from '@/lib/course-colours';
import { FOCUS_MINUTES } from '@/lib/pomodoro';
import { formatMinutes } from '@/lib/study';
import { createClient } from '@/lib/supabase/server';
import { localTimeZone, todayIn } from '@/lib/time';
import { getCourses, getSyllabusUnits } from '@/modules/courses';
import { getMinutesOnDate } from '@/modules/study';
import { ensureWorkspace } from '@/modules/workspaces';

// prompts/07-focus.md: "The timer is trivial. The log is the point."
//
// So this page is deliberately thin. It reads the two lists the picker needs —
// courses, and their syllabus units — and hands them to one client component
// along with the two server actions that can write. Everything with a clock in
// it lives in components/focus; everything that touches the database lives in
// modules/study. Neither knows about the other.

export const metadata = { title: 'Focus · Recalc' };

export default async function FocusPage() {
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

  const [courses, minutesToday] = await Promise.all([
    getCourses(supabase, workspace.id),
    getMinutesOnDate(supabase, workspace.id, today, zone),
  ]);

  // Courses come back ordered by code, so a course with no colour of its own
  // gets the same fallback here as it does on /today and /tasks.
  const picker: FocusCourse[] = courses.map((course, index) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    colour: colourForCourse(course.colour, index),
  }));

  // Every unit of every course, flattened. The picker narrows it to the chosen
  // course in the browser, which costs one small list and saves a round trip
  // between picking a course and picking a unit.
  const units: FocusUnit[] = (
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

  return (
    <>
      <PageHeader
        title="Focus"
        subtitle={
          minutesToday === 0
            ? `${FOCUS_MINUTES} minutes at a time, logged against a syllabus unit.`
            : `${formatMinutes(minutesToday)} logged today.`
        }
      />

      {courses.length === 0 ? (
        <Card>
          <EmptyState
            title="No courses yet"
            description={
              <>
                A focus block is always against a course, so there is nothing to
                start yet. Add your courses in{' '}
                <Link href="/settings/semester" className="underline">
                  the semester settings
                </Link>
                .
              </>
            }
          />
        </Card>
      ) : (
        <FocusTimer
          courses={picker}
          units={units}
          log={logStudySessionAction}
          rate={setFocusRatingAction}
        />
      )}
    </>
  );
}
