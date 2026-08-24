import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { saveLectureNoteAction, setLectureUnitAction } from './actions';
import { NoteEditor } from '@/components/notes/note-editor';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { dayTitle, timeRange } from '@/lib/calendar';
import { colourForCourse, courseDot } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { localDateKey, localTimeZone } from '@/lib/time';
import { getCourses, getMeeting, getSyllabusUnits } from '@/modules/courses';
import { getNoteDocument } from '@/modules/notes';
import { ensureWorkspace } from '@/modules/workspaces';

// One dated lecture — docs/DESIGN.md, "The lecture page".
//
// Header, then notes, files, questions, tasks, topic, in that order. Files
// arrive in slice 09 and questions in slice 12; both have a labelled home here
// already so they slot in rather than rearranging the page.

export const metadata = { title: 'Lecture · Recalc' };

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="pt-8">
      <p className="pb-3 font-mono text-label text-faint uppercase">{label}</p>
      {children}
    </section>
  );
}

export default async function LecturePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const meeting = await getMeeting(supabase, workspace.id, meetingId);
  if (!meeting) notFound();

  const zone = localTimeZone();
  const courses = await getCourses(supabase, workspace.id);
  const index = courses.findIndex((course) => course.id === meeting.course_id);
  const course = index === -1 ? null : courses[index];
  const colour = colourForCourse(course?.colour, Math.max(index, 0));

  const [units, note] = await Promise.all([
    course ? getSyllabusUnits(supabase, course.id) : Promise.resolve([]),
    meeting.note_block_id
      ? getNoteDocument(supabase, workspace.id, meeting.note_block_id)
      : Promise.resolve(null),
  ]);

  const date = localDateKey(new Date(meeting.starts_at), zone);
  const when = timeRange(
    { startsAt: meeting.starts_at, endsAt: meeting.ends_at },
    zone
  );
  const cancelled = meeting.status === 'cancelled';
  const setUnit = setLectureUnitAction.bind(null, meeting.id);

  return (
    <>
      <header className="pb-2">
        <Link
          href={`/calendar?d=${date}`}
          className="font-mono text-label text-faint uppercase underline-offset-4 hover:text-ink hover:underline"
        >
          ← Calendar
        </Link>

        <div className="flex items-center gap-2 pt-3">
          <span style={courseDot(colour)} />
          <span className="font-mono text-12 font-medium">{course?.code ?? '—'}</span>
          {cancelled ? <Pill>Cancelled</Pill> : null}
        </div>

        <h1
          className={
            cancelled
              ? 'pt-1 text-26 font-semibold tracking-tight line-through opacity-60'
              : 'pt-1 text-26 font-semibold tracking-tight'
          }
        >
          {course?.name ?? 'Unknown course'}
        </h1>

        <p className="pt-1 text-14 text-muted">
          {dayTitle(date)} · <span className="font-mono">{when}</span>
          {meeting.room ? ` · ${meeting.room}` : ''}
        </p>
      </header>

      <Section label="Notes">
        <NoteEditor
          docId={note?.id ?? null}
          nodes={note?.nodes ?? []}
          save={saveLectureNoteAction.bind(null, meeting.id)}
        />
      </Section>

      <Section label="Files">
        <Card>
          <EmptyState
            title="No files yet"
            description="Slides, a photo of the whiteboard, the problem sheet. Attaching them arrives with Google Drive in slice 09."
          />
        </Card>
      </Section>

      <Section label="Questions">
        <Card>
          <EmptyState
            title="No questions yet"
            description="Questions asked during this lecture, and whether they were ever answered. Slice 12."
          />
        </Card>
      </Section>

      <Section label="Tasks">
        <Card>
          <EmptyState
            title="Nothing set in this lecture"
            description="Homework and deadlines set here will hang off this lecture. Slice 06."
          />
        </Card>
      </Section>

      <Section label="Topic">
        {units.length === 0 ? (
          <Card>
            <EmptyState
              title="No syllabus units yet"
              description={`Add units to ${course?.code ?? 'this course'} and they show up here, one tap to pick the one this lecture covered.`}
            />
          </Card>
        ) : (
          <form action={setUnit} className="flex flex-wrap gap-2">
            {units.map((unit) => {
              const chosen = unit.id === meeting.unit_id;
              return (
                <button
                  key={unit.id}
                  type="submit"
                  name="unitId"
                  // Tapping the chosen unit again clears it.
                  value={chosen ? '' : unit.id}
                  aria-pressed={chosen}
                  className={
                    chosen
                      ? 'flex h-(--control-height) items-center rounded-full bg-ink px-3 text-13 font-medium text-bg'
                      : 'flex h-(--control-height) items-center rounded-full border border-border bg-surface px-3 text-13 text-muted transition-colors duration-100 hover:bg-sunken hover:text-ink'
                  }
                >
                  {unit.title}
                </button>
              );
            })}
          </form>
        )}

        <p className="pt-3 text-12 text-muted">
          Which part of the syllabus this lecture covered. It is the link that lets the
          app tell you where your hours actually went.
        </p>
      </Section>
    </>
  );
}
