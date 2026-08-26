import type { ReactNode } from 'react';

import { toggleTaskDoneAction } from '../tasks/actions';
import { ClassRow } from '@/components/today/class-row';
import { StudyStrip } from '@/components/today/study-strip';
import { TaskRow } from '@/components/today/task-row';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse, type CourseColour } from '@/lib/course-colours';
import { formatMinutes } from '@/lib/study';
import { createClient } from '@/lib/supabase/server';
import {
  localDateKey,
  localTimeLabel,
  localTimeZone,
  shiftDate,
  todayIn,
} from '@/lib/time';
import {
  DUE_WINDOW_DAYS,
  classStates,
  formatDate,
  formatDayLabel,
  formatShortDate,
  groupTasksByDay,
} from '@/lib/today';
import { getCourses, getMeetingsOnDate } from '@/modules/courses';
import { getMinutesOnDate, getMinutesThisWeek } from '@/modules/study';
import { getOverdueTasks, getTasksDueBetween, type Task } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// The page opened at 7:45am. Read-only, server-rendered, no spinners: by the
// time it paints it is already correct.
//
// Two questions and nothing else — what am I doing today, and what is due.
// docs/DESIGN.md, "What not to build": no statistics, no streaks, no charts.

export const metadata = { title: 'Today · Recalc' };

/** What a course looks like on this page: its code, its name, its colour. */
type CourseLook = { code: string; name: string; colour: CourseColour };

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="pb-3 font-mono text-label text-faint uppercase">{children}</p>;
}

/** The heading above one day's deadlines, inside the card. */
function DayHeading({ label, tone }: { label: string; tone?: 'accent' }) {
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

function DueList({
  tasks,
  lookUp,
  label,
  overdue = false,
}: {
  tasks: Task[];
  lookUp: (task: Task) => { code: string | null; colour: CourseColour | null; due: string };
  label: string;
  overdue?: boolean;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-line">
      {tasks.map((task) => {
        const { code, colour, due } = lookUp(task);
        return (
          <TaskRow
            key={task.id}
            id={task.id}
            title={task.title}
            code={code}
            colour={colour}
            due={due}
            overdue={overdue}
            toggle={toggleTaskDoneAction}
          />
        );
      })}
    </ul>
  );
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already redirects a signed-out visitor; this is only so the rest
  // of the function can assume a user.
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);

  // `localTimeZone()` is the machine's zone — this laptop, or whatever `TZ`
  // says on Vercel. Set it there, or the server's UTC midnight decides when
  // "today" ends. See docs/DECISIONS.md.
  const zone = localTimeZone();
  const today = todayIn(zone);
  const now = new Date();

  // Two reads, because they are two questions. "What is due in the next week"
  // is a window; "what is still open and already late" has no window at all —
  // a deadline from March is still a deadline. Until slice 06 the tasks module
  // could only answer the first, and this page faked the second with a 30-day
  // lookback. It does not any more.
  const [courses, meetings, dueTasks, overdueTasks, minutesToday, minutesThisWeek] =
    await Promise.all([
      getCourses(supabase, workspace.id),
      getMeetingsOnDate(supabase, workspace.id, today, zone),
      getTasksDueBetween(
        supabase,
        workspace.id,
        today,
        shiftDate(today, DUE_WINDOW_DAYS - 1),
        zone
      ),
      getOverdueTasks(supabase, workspace.id, now),
      // The two numbers prompts/07-focus.md allows, and no more.
      getMinutesOnDate(supabase, workspace.id, today, zone),
      getMinutesThisWeek(supabase, workspace.id, zone, today),
    ]);

  // A task due at 08:00 on a morning it is now 10:00 is in both lists.
  const seen = new Set<string>();
  const allTasks = [...overdueTasks, ...dueTasks].filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });

  // Courses come back ordered by code, so the fallback colour a course without
  // one gets is stable between renders.
  const look = new Map<string, CourseLook>();
  courses.forEach((course, index) => {
    look.set(course.id, {
      code: course.code,
      name: course.name,
      colour: colourForCourse(course.colour, index),
    });
  });

  const states = classStates(meetings, now);
  const due = groupTasksByDay(allTasks, { now, today, timeZone: zone });
  const hasDeadlines = due.overdue.length > 0 || due.days.length > 0;

  // groupTasksByDay has already dropped anything undated, so due_at is a
  // string by the time a row is rendered.
  function courseOf(task: Task) {
    const found = task.course_id ? look.get(task.course_id) : undefined;
    return { code: found?.code ?? null, colour: found?.colour ?? null };
  }

  return (
    <>
      <PageHeader title="Today" subtitle={formatDate(today)} />

      {/* Minutes studied, and the way in to /focus. Two numbers, no chart —
          prompts/07-focus.md: "do not build a stats dashboard". */}
      <div className="pt-2">
        <StudyStrip
          today={formatMinutes(minutesToday)}
          week={formatMinutes(minutesThisWeek)}
        />
      </div>

      <section className="pt-8">
        <SectionLabel>Classes</SectionLabel>

        {meetings.length === 0 ? (
          <Card>
            {courses.length === 0 ? (
              <EmptyState
                title="No timetable yet"
                description="Add your courses and their weekly sessions, then generate this term's lectures. docs/SEEDING.md has the steps."
              />
            ) : (
              <EmptyState
                title="No classes today"
                description={`Nothing on the timetable for ${formatDate(today)}.`}
              />
            )}
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {meetings.map((meeting, index) => {
              const found = look.get(meeting.course_id);
              return (
                <ClassRow
                  key={meeting.id}
                  startsAt={localTimeLabel(new Date(meeting.starts_at), zone)}
                  endsAt={localTimeLabel(new Date(meeting.ends_at), zone)}
                  code={found?.code ?? '—'}
                  name={found?.name ?? 'Unknown course'}
                  room={meeting.room}
                  colour={found?.colour ?? 'indigo'}
                  state={states[index]}
                  cancelled={meeting.status === 'cancelled'}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="pt-8">
        <SectionLabel>Due this week</SectionLabel>

        <Card className="overflow-hidden">
          {!hasDeadlines ? (
            <EmptyState
              title="Nothing due this week"
              description="Deadlines land here as soon as you add them — soonest first, and anything late at the top."
            />
          ) : (
            <>
              {due.overdue.length > 0 ? (
                <>
                  <DayHeading label={`Overdue · ${due.overdue.length}`} tone="accent" />
                  <DueList
                    label="Overdue"
                    overdue
                    tasks={due.overdue}
                    lookUp={(task) => ({
                      ...courseOf(task),
                      // The date, not the time: once something is late, which
                      // day it was due is the useful fact.
                      due: formatShortDate(localDateKey(new Date(task.due_at!), zone)),
                    })}
                  />
                </>
              ) : null}

              {due.days.map((day, index) => (
                <div key={day.date}>
                  {index > 0 || due.overdue.length > 0 ? <CardDivider /> : null}
                  <DayHeading label={formatDayLabel(day.date, today)} />
                  <DueList
                    label={formatDayLabel(day.date, today)}
                    tasks={day.tasks}
                    lookUp={(task) => ({
                      ...courseOf(task),
                      due: localTimeLabel(new Date(task.due_at!), zone),
                    })}
                  />
                </div>
              ))}
            </>
          )}
        </Card>
      </section>
    </>
  );
}
