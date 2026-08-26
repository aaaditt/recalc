import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  addUnitAction,
  addUnitNoteAction,
  addUnitTaskAction,
  renameUnitAction,
  unitRowAction,
} from './actions';
import { AddUnit } from '@/components/syllabus/add-unit';
import { UnitTitle } from '@/components/syllabus/unit-title';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { colourForCourse, courseDot } from '@/lib/course-colours';
import { cx } from '@/lib/cx';
import { formatMinutes } from '@/lib/study';
import { createClient } from '@/lib/supabase/server';
import {
  courseProgress,
  nextUnitStatus,
  progressLabel,
  rollUpUnits,
  unitStatusLabel,
  type UnitRollup,
  type UnitStatus,
} from '@/lib/syllabus';
import { localTimeZone } from '@/lib/time';
import { formatShortDate } from '@/lib/today';
import { getCourse, getCourses, getSyllabusUnits } from '@/modules/courses';
import { listNotes } from '@/modules/notes';
import { getUnitStudy } from '@/modules/study';
import { getTasks } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// One course, as an ordered syllabus — prompts/08-syllabus.md.
//
// This is the backbone slice 12 hangs its payoff on: minutes and, later,
// unanswered questions are counted per unit, and a unit only means something
// once it has a place in an order and a status I set myself.
//
// Server-rendered, and almost entirely without JavaScript: the status chip and
// the two arrows are submit buttons in a plain <form>, and the only client
// components are the two places a cursor has to stay where it was — the
// inline title and the add box.

export const metadata = { title: 'Course · Recalc' };

/**
 * The status chip. Neutral until comfortable, then the "fresh" green, which is
 * the one other colour docs/DESIGN.md allows. The accent is not used here: it
 * means "something needs attention", and a syllabus unit is not an alarm.
 */
const STATUS_CHIP: Record<UnitStatus, string> = {
  not_started: 'bg-sunken text-faint',
  shaky: 'bg-sunken text-ink',
  comfortable: 'bg-ok-bg text-ok',
  mastered: 'bg-ok text-bg',
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="pt-8">
      <p className="pb-3 font-mono text-label text-faint uppercase">{label}</p>
      {children}
    </section>
  );
}

/** '1h 25m · 2 notes · 1 open task', or the honest absence of all three. */
function unitFacts(unit: UnitRollup): string {
  if (unit.untouched) return 'Never opened';

  const parts: string[] = [];
  parts.push(unit.minutes > 0 ? formatMinutes(unit.minutes) : 'No minutes');
  if (unit.notes > 0) parts.push(`${unit.notes} note${unit.notes === 1 ? '' : 's'}`);
  if (unit.openTasks > 0) {
    parts.push(`${unit.openTasks} open task${unit.openTasks === 1 ? '' : 's'}`);
  }
  if (unit.lastStudiedOn) parts.push(`last ${formatShortDate(unit.lastStudiedOn)}`);
  return parts.join(' · ');
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const course = await getCourse(supabase, workspace.id, id);
  if (!course) notFound();

  const zone = localTimeZone();

  const [courses, units, study, notes, tasks] = await Promise.all([
    getCourses(supabase, workspace.id),
    getSyllabusUnits(supabase, course.id),
    getUnitStudy(supabase, workspace.id, zone),
    listNotes(supabase, workspace.id, zone),
    getTasks(supabase, workspace.id),
  ]);

  // Courses come back ordered by code, so a course with no colour of its own
  // gets the same fallback here as it does on /today, /tasks and /calendar.
  const colour = colourForCourse(
    course.colour,
    Math.max(
      courses.findIndex((entry) => entry.id === course.id),
      0
    )
  );

  const rolled = rollUpUnits(
    units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      position: unit.position,
      status: unit.status,
    })),
    {
      study,
      notes,
      tasks: tasks.map((task) => ({ unitId: task.unit_id, status: task.status })),
    }
  );
  const progress = courseProgress(rolled);

  const rowAction = unitRowAction.bind(null, course.id);
  const rename = renameUnitAction.bind(null, course.id);
  const addTask = addUnitTaskAction.bind(null, course.id);
  const addNote = addUnitNoteAction.bind(null, course.id);

  const arrow = cx(
    'flex h-(--control-height) w-(--control-height) items-center justify-center rounded-card',
    'text-14 text-muted transition-colors duration-100',
    'hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30'
  );

  return (
    <>
      <header className="pb-2">
        <Link
          href="/courses"
          className="font-mono text-label text-faint uppercase underline-offset-4 hover:text-ink hover:underline"
        >
          ← Courses
        </Link>

        <div className="flex items-center gap-2 pt-3">
          <span style={courseDot(colour)} />
          <span className="font-mono text-12 font-medium">{course.code}</span>
          <Pill>{course.term}</Pill>
        </div>

        <h1 className="pt-1 text-26 font-semibold tracking-tight">{course.name}</h1>

        <p className="pt-1 text-14 text-muted">{progressLabel(progress)}</p>
        {progress.minutes > 0 ? (
          <p className="pt-1 text-13 text-faint">
            {formatMinutes(progress.minutes)} logged against these units.
          </p>
        ) : null}
      </header>

      <Section label="Syllabus">
        <Card className="overflow-hidden">
          {rolled.length === 0 ? (
            <EmptyState
              title="No units yet"
              description="Type the first topic from the syllabus into the box below, press enter, and keep going."
            />
          ) : (
            <ul className="divide-y divide-line">
              {rolled.map((unit, index) => {
                const unitNotes = notes.filter((note) => note.unitId === unit.id);
                const unitTasks = tasks.filter((task) => task.unit_id === unit.id);

                return (
                  <li key={unit.id} className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-right font-mono text-12 text-faint">
                        {index + 1}
                      </span>

                      <UnitTitle
                        unitId={unit.id}
                        title={unit.title}
                        rename={rename}
                      />

                      {/* One form, three submit buttons. The status button
                          posts the next status along; the arrows post a move.
                          Only the clicked button's name and value are sent, so
                          they cannot be confused with one another. */}
                      <form action={rowAction} className="flex shrink-0 items-center gap-1">
                        <input type="hidden" name="unitId" value={unit.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={nextUnitStatus(unit.status)}
                        />

                        <button
                          type="submit"
                          title={`Mark ${unitStatusLabel(nextUnitStatus(unit.status)).toLowerCase()}`}
                          className={cx(
                            'flex h-(--control-height) items-center rounded-full px-3',
                            'text-12 font-medium whitespace-nowrap transition-colors duration-100',
                            STATUS_CHIP[unit.status]
                          )}
                        >
                          {unitStatusLabel(unit.status)}
                        </button>

                        <button
                          type="submit"
                          name="move"
                          value="up"
                          aria-label={`Move ${unit.title} up`}
                          disabled={index === 0}
                          className={arrow}
                        >
                          ↑
                        </button>
                        <button
                          type="submit"
                          name="move"
                          value="down"
                          aria-label={`Move ${unit.title} down`}
                          disabled={index === rolled.length - 1}
                          className={arrow}
                        >
                          ↓
                        </button>
                      </form>
                    </div>

                    {/* The facts line doubles as the disclosure: a quiet
                        summary by default, everything attached to the unit
                        underneath it when it is opened. */}
                    <details className="pl-7">
                      <summary
                        className={cx(
                          'cursor-pointer list-none pb-1 text-12',
                          unit.untouched ? 'text-faint' : 'text-muted'
                        )}
                      >
                        {unitFacts(unit)}
                      </summary>

                      <div className="flex flex-col gap-3 pt-2 pb-3">
                        {unitNotes.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {unitNotes.map((note) => (
                              <li key={note.blockId}>
                                <Link
                                  href={note.href}
                                  className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
                                >
                                  {note.date
                                    ? `Lecture · ${formatShortDate(note.date)}`
                                    : note.title || 'Untitled note'}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {unitTasks.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {unitTasks.map((task) => (
                              <li
                                key={task.id}
                                className={cx(
                                  'text-13',
                                  task.status === 'done' || task.status === 'dropped'
                                    ? 'text-faint line-through'
                                    : 'text-muted'
                                )}
                              >
                                {task.title}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <form action={addTask} className="flex items-center gap-2">
                          <input type="hidden" name="unitId" value={unit.id} />
                          <Input
                            name="title"
                            required
                            maxLength={200}
                            aria-label={`New task on ${unit.title}`}
                            placeholder="Task on this unit"
                          />
                          <Button type="submit">Add task</Button>
                        </form>

                        <form action={addNote} className="flex items-center gap-2">
                          <input type="hidden" name="unitId" value={unit.id} />
                          <Input
                            name="title"
                            required
                            maxLength={120}
                            aria-label={`New note on ${unit.title}`}
                            placeholder="Note on this unit"
                          />
                          <Button type="submit">New note</Button>
                        </form>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}

          {rolled.length > 0 ? <CardDivider /> : null}

          <AddUnit courseId={course.id} count={rolled.length} add={addUnitAction} />
        </Card>

        <p className="pt-3 text-12 text-muted">
          Tap a status to move it along: not started → shaky → comfortable → mastered,
          and round again. Nothing here is inferred — progress counts only what you
          marked yourself.
        </p>
      </Section>
    </>
  );
}
