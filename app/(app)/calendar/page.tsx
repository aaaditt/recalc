import {
  addOneOffMeetingAction,
  rescheduleMeetingAction,
  setMeetingCancelledAction,
} from './actions';
import { Calendar } from '@/components/calendar/calendar';
import {
  dateFromParam,
  viewFromParam,
  type CalendarDeadline,
  type CalendarMeeting,
} from '@/lib/calendar';
import { colourForCourse, type CourseColour } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { localTimeZone, shiftDate, todayIn } from '@/lib/time';
import { getCourses, getMeetingsBetween } from '@/modules/courses';
import { getTasksDueBetween } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// The screen the semester is planned in. Server-rendered, no spinner: by the
// time it paints it is already correct.
//
// It fetches ten weeks either side of wherever the cursor is, so the client
// can move through the term without a single round trip — docs/DESIGN.md,
// "changing week or day must never show a loading state". A term's meetings
// are a few hundred rows; this is cheaper than prefetching neighbours would be.

export const metadata = { title: 'Calendar · Recalc' };

/** Ten weeks either side of the cursor. About a term in each direction. */
const WINDOW_DAYS = 70;

type CourseLook = { code: string; name: string; colour: CourseColour };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; v?: string }>;
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

  // The machine's zone — this laptop, or whatever `TZ` says on Vercel.
  const zone = localTimeZone();
  const today = todayIn(zone);
  const anchor = dateFromParam(params.d, today);

  const windowFrom = shiftDate(anchor, -WINDOW_DAYS);
  const windowTo = shiftDate(anchor, WINDOW_DAYS);

  const [courses, meetingRows, taskRows] = await Promise.all([
    getCourses(supabase, workspace.id),
    getMeetingsBetween(supabase, workspace.id, windowFrom, windowTo, zone),
    getTasksDueBetween(supabase, workspace.id, windowFrom, windowTo, zone),
  ]);

  // Courses come back ordered by code, so a course without a colour of its own
  // gets a stable one from the palette.
  const look = new Map<string, CourseLook>();
  courses.forEach((course, index) => {
    look.set(course.id, {
      code: course.code,
      name: course.name,
      colour: colourForCourse(course.colour, index),
    });
  });

  const meetings: CalendarMeeting[] = meetingRows.map((meeting) => {
    const course = look.get(meeting.course_id);
    return {
      id: meeting.id,
      courseId: meeting.course_id,
      code: course?.code ?? '—',
      name: course?.name ?? 'Unknown course',
      colour: course?.colour ?? 'indigo',
      room: meeting.room,
      startsAt: meeting.starts_at,
      endsAt: meeting.ends_at,
      cancelled: meeting.status === 'cancelled',
    };
  });

  const deadlines: CalendarDeadline[] = taskRows
    .filter((task) => task.due_at !== null)
    .filter((task) => task.status !== 'done' && task.status !== 'dropped')
    .map((task) => {
      const course = task.course_id ? look.get(task.course_id) : undefined;
      return {
        id: task.id,
        title: task.title,
        code: course?.code ?? null,
        colour: course?.colour ?? null,
        dueAt: String(task.due_at),
      };
    });

  return (
    // Wider than the reading column every other screen gets: this one is a
    // grid, and five day columns need the room. See the (narrow) route group.
    <div className="mx-auto w-full max-w-(--page-width-wide)">
      <Calendar
        today={today}
        timeZone={zone}
        initialDate={anchor}
        initialView={viewFromParam(params.v)}
        windowFrom={windowFrom}
        windowTo={windowTo}
        meetings={meetings}
        deadlines={deadlines}
        courses={courses.map((course) => ({
          id: course.id,
          code: course.code,
          name: course.name,
        }))}
        reschedule={rescheduleMeetingAction}
        setCancelled={setMeetingCancelledAction}
        addOneOff={addOneOffMeetingAction}
      />
    </div>
  );
}
