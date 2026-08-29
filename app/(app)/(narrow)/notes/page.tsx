import Link from 'next/link';

import { createStandaloneNoteAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse, courseDot, type CourseColour } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import { formatShortDate } from '@/lib/today';
import { getCourses, getSyllabusUnits, type SyllabusUnit } from '@/modules/courses';
import { listNotes, type NoteListEntry } from '@/modules/notes';
import { ensureWorkspace } from '@/modules/workspaces';

// Every note, grouped by course, newest first.
//
// Two kinds of note land in the same list: the note for a lecture, which shows
// its date, and a free-standing one, which shows its title. Tapping either
// opens where that note lives.

export const metadata = { title: 'Notes · Recalc' };

type CourseLook = { code: string; name: string; colour: CourseColour };

export default async function NotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const zone = localTimeZone();

  const [courses, notes] = await Promise.all([
    getCourses(supabase, workspace.id),
    listNotes(supabase, workspace.id, zone),
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

  // Units for the "new note" picker, grouped under their course.
  const unitsByCourse = new Map<string, SyllabusUnit[]>();
  await Promise.all(
    courses.map(async (course) => {
      unitsByCourse.set(course.id, await getSyllabusUnits(supabase, course.id));
    })
  );

  // Grouped by course, in course-code order; anything whose course has gone
  // away sits at the end rather than disappearing.
  const groups: { id: string | null; notes: NoteListEntry[] }[] = [];
  for (const course of courses) {
    const mine = notes.filter((note) => note.courseId === course.id);
    if (mine.length > 0) groups.push({ id: course.id, notes: mine });
  }
  const orphans = notes.filter((note) => !note.courseId || !look.has(note.courseId));
  if (orphans.length > 0) groups.push({ id: null, notes: orphans });

  return (
    <>
      <PageHeader
        title="Notes"
        subtitle={
          notes.length === 0
            ? undefined
            : `${notes.length} note${notes.length === 1 ? '' : 's'}`
        }
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title="No notes yet"
            description="Open a lecture from the calendar and start typing — the note is created as soon as there is something in it. Or write a free-standing one below."
            action={
              <Link
                href="/calendar"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Go to the calendar
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const course = group.id ? look.get(group.id) : undefined;
            return (
              <section key={group.id ?? 'none'}>
                <div className="flex items-center gap-2 pb-3">
                  {course ? <span style={courseDot(course.colour)} /> : null}
                  <span className="font-mono text-12 font-medium">
                    {course?.code ?? '—'}
                  </span>
                  <span className="min-w-0 truncate text-13 text-muted">
                    {course?.name ?? 'No course'}
                  </span>
                </div>

                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {group.notes.map((note) => (
                      <li key={note.blockId}>
                        <Link
                          href={note.href}
                          className="flex items-center gap-3 px-4 py-3 transition-colors duration-100 hover:bg-sunken"
                        >
                          <span className="min-w-0 flex-1 truncate text-14">
                            {note.date ? 'Lecture' : note.title || 'Untitled note'}
                          </span>
                          <span className="shrink-0 font-mono text-12 text-faint">
                            {note.date ? formatShortDate(note.date) : 'Note'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <section className="pt-8">
        <p className="pb-3 font-mono text-label text-faint uppercase">New note</p>

        <Card>
          {courses.length === 0 ? (
            <EmptyState
              title="No courses yet"
              description="A note belongs to a course. Add your courses first, on /courses or by clicking a cell on the timetable."
            />
          ) : (
            <form
              action={createStandaloneNoteAction}
              className="flex flex-col gap-4 px-4 py-4"
            >
              <Field label="Title">
                <Input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="Formula sheet"
                />
              </Field>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label="Course" className="flex-1">
                  <Select name="courseId" required>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} · {course.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Unit (optional)" className="flex-1">
                  <Select name="unitId" defaultValue="">
                    <option value="">No unit</option>
                    {courses.map((course) => {
                      const units = unitsByCourse.get(course.id) ?? [];
                      if (units.length === 0) return null;
                      return (
                        <optgroup key={course.id} label={course.code}>
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.title}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </Select>
                </Field>
              </div>

              <Button type="submit" variant="primary">
                Create note
              </Button>
            </form>
          )}
        </Card>
      </section>
    </>
  );
}
