import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  addLectureTaskAction,
  attachDriveFilesAction,
  prepareDriveUploadAction,
  removeLectureFileAction,
  saveLectureImageAction,
  saveLectureNoteAction,
  setLectureUnitAction,
  summariseLectureNoteAction,
} from './actions';
import {
  answerQuestionAction,
  askQuestionAction,
  setQuestionResolvedAction,
} from '../../questions/actions';
import { toggleTaskDoneAction } from '../../tasks/actions';
import { AttachFiles } from '@/components/files/attach-files';
import { FileGrid } from '@/components/files/file-grid';
import { NoteEditor } from '@/components/notes/note-editor';
import { NoteSummary } from '@/components/notes/note-summary';
import { QuestionList } from '@/components/questions/question-list';
import { TaskItem } from '@/components/tasks/task-item';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { dayTitle, timeRange } from '@/lib/calendar';
import { colourForCourse, courseDot } from '@/lib/course-colours';
import { publicEnv } from '@/lib/env';
import { recalcFolderPath } from '@/lib/files';
import { createClient } from '@/lib/supabase/server';
import { dueLabel, isOverdue } from '@/lib/tasks';
import { localDateKey, localTimeZone, todayIn } from '@/lib/time';
import { getCourses, getMeeting, getSyllabusUnits } from '@/modules/courses';
import { getFilesForMeeting } from '@/modules/files';
import { getGoogleAccount } from '@/modules/google';
import { getNoteDocument } from '@/modules/notes';
import { getQuestionsForNote } from '@/modules/questions';
import { getNoteSummary } from '@/modules/recalc';
import { getTasksForMeeting } from '@/modules/tasks';
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

  const [units, note, summary, questions, tasks, files, google] = await Promise.all([
    course ? getSyllabusUnits(supabase, course.id) : Promise.resolve([]),
    meeting.note_block_id
      ? getNoteDocument(supabase, workspace.id, meeting.note_block_id)
      : Promise.resolve(null),
    meeting.note_block_id
      ? getNoteSummary(supabase, workspace.id, meeting.note_block_id)
      : Promise.resolve(null),
    meeting.note_block_id
      ? getQuestionsForNote(supabase, workspace.id, meeting.note_block_id, zone)
      : Promise.resolve([]),
    getTasksForMeeting(supabase, workspace.id, meeting.id),
    getFilesForMeeting(supabase, workspace.id, meeting.id),
    // Reading the connection is a plain table read — it never touches Google —
    // so a lecture page still renders instantly with Drive down or absent.
    getGoogleAccount(supabase, user.id),
  ]);

  const today = todayIn(zone);
  const now = new Date();

  const date = localDateKey(new Date(meeting.starts_at), zone);
  const when = timeRange(
    { startsAt: meeting.starts_at, endsAt: meeting.ends_at },
    zone
  );
  const cancelled = meeting.status === 'cancelled';
  const setUnit = setLectureUnitAction.bind(null, meeting.id);

  const saveImage = saveLectureImageAction.bind(null, meeting.id);
  const removeLectureFile = removeLectureFileAction.bind(null, meeting.id);

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
          makeTask={addLectureTaskAction.bind(null, meeting.id)}
          saveImage={saveImage}
          askQuestion={askQuestionAction}
        />
        <p className="pt-2 text-12 text-muted">
          Select a sentence and press <span className="font-mono">＋ Task</span> to turn it
          into a deadline that remembers where it came from, or{' '}
          <span className="font-mono">? Ask</span> to put a question against it. Paste a
          screenshot and it lands in Files below.
        </p>
      </Section>

      <Section label="Summary">
        <NoteSummary
          summary={
            summary
              ? {
                  text: summary.text,
                  status: summary.status,
                  error: summary.error,
                  model: summary.model,
                  computedLabel: summary.computedAt
                    ? dayTitle(localDateKey(new Date(summary.computedAt), zone))
                    : null,
                }
              : null
          }
          summarise={summariseLectureNoteAction.bind(null, meeting.id)}
        />
      </Section>

      <Section label="Files">
        <div className="flex flex-col gap-3">
          <FileGrid files={files} remove={removeLectureFile} />

          <AttachFiles
            connected={google !== null}
            needsReconnect={google !== null && !google.canUseDrive}
            developerKey={publicEnv.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? null}
            folderPath={recalcFolderPath(course?.code ?? null)}
            prepare={prepareDriveUploadAction.bind(null, meeting.id)}
            attach={attachDriveFilesAction.bind(null, meeting.id)}
            saveImage={saveImage}
          />
        </div>
      </Section>

      <Section label="Questions">
        <QuestionList
          questions={questions}
          timeZone={zone}
          answerIt={answerQuestionAction}
          setResolved={setQuestionResolvedAction}
        />
      </Section>

      <Section label="Tasks">
        <Card className="overflow-hidden">
          {tasks.length === 0 ? (
            <EmptyState
              title="Nothing set in this lecture"
              description="Select a sentence in the note above and make a task from it, or add one on the tasks page."
              action={
                <Link
                  href="/tasks"
                  className="text-13 text-muted underline underline-offset-4 hover:text-ink"
                >
                  Go to tasks
                </Link>
              }
            />
          ) : (
            <ul aria-label="Tasks set in this lecture" className="divide-y divide-line">
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  id={task.id}
                  title={task.title}
                  done={task.status === 'done' || task.status === 'dropped'}
                  overdue={isOverdue(task, now)}
                  code={course?.code ?? null}
                  colour={colour}
                  due={dueLabel(task.due_at, { today, timeZone: zone })}
                  toggle={toggleTaskDoneAction}
                />
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <Section label="Topic">
        {units.length === 0 ? (
          <Card>
            <EmptyState
              title="No syllabus units yet"
              description={`Add units to ${course?.code ?? 'this course'} and they show up here, one tap to pick the one this lecture covered.`}
              action={
                course ? (
                  <Link
                    href={`/courses/${course.id}`}
                    className="text-13 text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Type in the syllabus
                  </Link>
                ) : null
              }
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
          {course ? (
            <>
              {' '}
              <Link
                href={`/courses/${course.id}`}
                className="underline underline-offset-4 hover:text-ink"
              >
                Edit the syllabus
              </Link>
              .
            </>
          ) : null}
        </p>
      </Section>
    </>
  );
}
