import Link from 'next/link';
import { notFound } from 'next/navigation';

import { saveNoteAction } from '../actions';
import { NoteEditor } from '@/components/notes/note-editor';
import { colourForCourse, courseDot } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { getCourses } from '@/modules/courses';
import { getNoteDocument, getStandaloneNote } from '@/modules/notes';
import { ensureWorkspace } from '@/modules/workspaces';

// One note document, open in the editor.
//
// A lecture's note is normally reached through its lecture page, which has the
// date, the room and the topic around it. This route is the same document with
// nothing around it, and it is where a free-standing note lives.

export const metadata = { title: 'Note · Recalc' };

export default async function NotePage({
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
  const note = await getNoteDocument(supabase, workspace.id, id);
  if (!note) notFound();

  const standalone = await getStandaloneNote(supabase, workspace.id, note.id);
  const courses = await getCourses(supabase, workspace.id);
  const index = courses.findIndex((course) => course.id === standalone?.course_id);
  const course = index === -1 ? null : courses[index];

  return (
    <>
      <header className="pb-2">
        <Link
          href="/notes"
          className="font-mono text-label text-faint uppercase underline-offset-4 hover:text-ink hover:underline"
        >
          ← Notes
        </Link>

        {course ? (
          <div className="flex items-center gap-2 pt-3">
            <span style={courseDot(colourForCourse(course.colour, index))} />
            <span className="font-mono text-12 font-medium">{course.code}</span>
            <span className="min-w-0 truncate text-13 text-muted">{course.name}</span>
          </div>
        ) : null}

        <h1 className="pt-1 text-26 font-semibold tracking-tight">
          {note.title || 'Untitled note'}
        </h1>
      </header>

      <NoteEditor docId={note.id} nodes={note.nodes} save={saveNoteAction} />
    </>
  );
}
