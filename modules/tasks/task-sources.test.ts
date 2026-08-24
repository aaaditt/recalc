import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { generateMeetings, getMeetingsOnDate } from '@/modules/courses';
import {
  createStandaloneNote,
  ensureLectureNote,
  getNoteRefs,
  saveNoteDocument,
} from '@/modules/notes';
import {
  createTask,
  deleteTask,
  getOverdueTasks,
  getTask,
  getTasksForMeeting,
  getTasksFromBlock,
  setTaskStatus,
  updateTask,
} from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';

// THE invariant of slice 06:
//
//   a task made from a sentence in a note remembers which block it came from,
//   and the link resolves in both directions.
//
// prompts/06-tasks.md asks for exactly that. It matters because a task made
// from a lecture note is the first thing in the app with provenance that a
// person reads — the /review queue in slice 11 is the same idea with a machine
// reading it — so if `source_block_id` can be written wrong, or read back to
// the wrong page, the pattern is broken before the engine is built on it.
//
// The second half of this file is the authorization pattern docs/DECISIONS.md
// records twice already: every client-supplied id that points at another entity
// must be proved to belong to the caller's workspace before anything is
// written. Two real bugs of this shape were found in slices 04 and 05. This
// asserts the tasks module does not make it a third time.
//
// Real database, because RLS, the foreign keys and the cascade are part of what
// is being proven. Throwaway users + workspaces, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'task-sources.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

// 2026-10-05 is a Monday, so this term holds exactly three Tuesdays.
const TERM_START = '2026-10-05';
const TERM_END = '2026-10-23';
const TIME_ZONE = 'Asia/Dubai';

/** A signed-up user with a workspace, a course, a unit and a term of lectures. */
async function makeWorkspace(db: SupabaseClient, label: string) {
  const { data, error } = await db.auth.admin.createUser({
    email: `${label}-${randomUUID()}@example.com`,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create test user: ${error.message}`);
  const userId = data.user.id;

  const workspaceId = (await ensureWorkspace(db, userId)).id;

  const { data: course, error: cErr } = await db
    .from('courses')
    .insert({
      workspace_id: workspaceId,
      code: 'ME301',
      name: 'Thermodynamics II',
      term: 'Fall 2026',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`could not create course: ${cErr.message}`);

  const { data: unit, error: uErr } = await db
    .from('syllabus_units')
    .insert({ course_id: course.id, position: 1, title: 'Unit 1 — Entropy' })
    .select('id')
    .single();
  if (uErr) throw new Error(`could not create unit: ${uErr.message}`);

  const { error: sErr } = await db.from('sessions').insert([
    { course_id: course.id, weekday: 2, starts_at: '09:00', ends_at: '10:30', room: 'B204' },
  ]);
  if (sErr) throw new Error(`could not create session: ${sErr.message}`);

  await generateMeetings(db, {
    workspaceId,
    termStart: TERM_START,
    termEnd: TERM_END,
    timeZone: TIME_ZONE,
  });

  const [meeting] = await getMeetingsOnDate(db, workspaceId, '2026-10-06', TIME_ZONE);

  return { userId, workspaceId, courseId: course.id as string, unitId: unit.id as string, meeting };
}

// ---------------------------------------------------------------------------

describe('a task made from a note remembers where it came from', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let courseId: string;
  let meetingId: string;

  /** The block id of the first paragraph of this lecture's note. */
  let paragraphId: string;
  let docId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const made = await makeWorkspace(db, 'task-sources');
    userId = made.userId;
    workspaceId = made.workspaceId;
    courseId = made.courseId;
    meetingId = made.meeting.id;

    // Write a lecture note with two paragraphs, exactly as the editor would.
    docId = await ensureLectureNote(db, workspaceId, meetingId);
    paragraphId = randomUUID();

    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        {
          type: 'paragraph',
          attrs: { blockId: paragraphId },
          content: [{ type: 'text', text: 'Problem sheet 4 is due next Friday at five.' }],
        },
        {
          type: 'paragraph',
          attrs: { blockId: randomUUID() },
          content: [{ type: 'text', text: 'Entropy is not disorder.' }],
        },
      ],
    });
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to courses,
    // meetings, blocks and tasks.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('stores the block the sentence was selected in', async () => {
    const task = await createTask(db, {
      workspaceId,
      title: 'Problem sheet 4',
      courseId,
      meetingId,
      dueAt: '2026-10-16T13:00:00.000Z',
      sourceBlockId: paragraphId,
    });

    expect(task.source_block_id).toBe(paragraphId);
    expect(task.course_id).toBe(courseId);
    expect(task.meeting_id).toBe(meetingId);
  });

  it('resolves block -> task: the paragraph knows what it produced', async () => {
    const fromBlock = await getTasksFromBlock(db, workspaceId, paragraphId);

    expect(fromBlock).toHaveLength(1);
    expect(fromBlock[0].title).toBe('Problem sheet 4');
  });

  it('resolves task -> note: the task knows which page to go back to', async () => {
    const [task] = await getTasksFromBlock(db, workspaceId, paragraphId);
    const refs = await getNoteRefs(db, workspaceId, [task.source_block_id as string]);
    const ref = refs.get(task.source_block_id as string);

    expect(ref).toBeDefined();
    // The paragraph's parent is the note document...
    expect(ref?.docId).toBe(docId);
    // ...and that document is this lecture's, so the link is the lecture page.
    expect(ref?.meetingId).toBe(meetingId);
    expect(ref?.href).toBe(`/lecture/${meetingId}`);
  });

  it('a free-standing note resolves to the note page instead', async () => {
    const noteId = await createStandaloneNote(db, {
      workspaceId,
      title: 'Formula sheet',
      courseId,
    });
    const lineId = randomUUID();
    await saveNoteDocument(db, workspaceId, noteId, {
      nodes: [
        {
          type: 'paragraph',
          attrs: { blockId: lineId },
          content: [{ type: 'text', text: 'Look up the Clausius inequality.' }],
        },
      ],
    });

    const task = await createTask(db, {
      workspaceId,
      title: 'Look up the Clausius inequality',
      courseId,
      sourceBlockId: lineId,
    });

    const ref = (await getNoteRefs(db, workspaceId, [lineId])).get(lineId);
    expect(task.source_block_id).toBe(lineId);
    expect(ref?.docId).toBe(noteId);
    expect(ref?.meetingId).toBeNull();
    expect(ref?.href).toBe(`/notes/${noteId}`);
  });

  it('the lecture lists the task that was set in it', async () => {
    const forMeeting = await getTasksForMeeting(db, workspaceId, meetingId);
    expect(forMeeting.map((task) => task.title)).toContain('Problem sheet 4');
  });

  it('keeps the provenance through an edit, and loses it only on delete', async () => {
    const [task] = await getTasksFromBlock(db, workspaceId, paragraphId);

    const renamed = await updateTask(db, workspaceId, task.id, {
      title: 'Problem sheet 4 (part b)',
      dueAt: '2026-10-17T13:00:00.000Z',
    });
    expect(renamed.source_block_id).toBe(paragraphId);

    const completed = await setTaskStatus(db, workspaceId, task.id, 'done');
    expect(completed.status).toBe('done');
    expect(completed.source_block_id).toBe(paragraphId);

    await deleteTask(db, workspaceId, task.id);
    expect(await getTask(db, workspaceId, task.id)).toBeNull();
    expect(await getTasksFromBlock(db, workspaceId, paragraphId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('overdue has no lookback window', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const made = await makeWorkspace(db, 'task-overdue');
    userId = made.userId;
    workspaceId = made.workspaceId;
  });

  afterAll(async () => {
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('finds an essay from four months ago, which the old 30-day window could not', async () => {
    const now = new Date('2026-08-24T06:00:00.000Z');

    const ancient = await createTask(db, {
      workspaceId,
      title: 'The essay from April',
      dueAt: '2026-04-02T09:00:00.000Z',
    });
    const soon = await createTask(db, {
      workspaceId,
      title: 'Due tonight',
      dueAt: '2026-08-24T16:00:00.000Z',
    });
    const finished = await createTask(db, {
      workspaceId,
      title: 'Already handed in',
      dueAt: '2026-04-02T09:00:00.000Z',
      status: 'done',
    });
    const undated = await createTask(db, { workspaceId, title: 'Someday' });

    const overdue = await getOverdueTasks(db, workspaceId, now);
    const ids = overdue.map((task) => task.id);

    expect(ids).toContain(ancient.id);
    expect(ids).not.toContain(soon.id);
    expect(ids).not.toContain(finished.id);
    expect(ids).not.toContain(undated.id);
  });

  it('drops a task out of overdue the moment it is completed', async () => {
    const now = new Date('2026-08-24T06:00:00.000Z');

    const task = await createTask(db, {
      workspaceId,
      title: 'Reading from May',
      dueAt: '2026-05-05T09:00:00.000Z',
    });
    expect((await getOverdueTasks(db, workspaceId, now)).map((t) => t.id)).toContain(task.id);

    await setTaskStatus(db, workspaceId, task.id, 'done');
    expect((await getOverdueTasks(db, workspaceId, now)).map((t) => t.id)).not.toContain(
      task.id
    );
  });
});

// ---------------------------------------------------------------------------

describe('a client-supplied id must belong to the caller', () => {
  let db: SupabaseClient;
  let mine: Awaited<ReturnType<typeof makeWorkspace>>;
  let theirs: Awaited<ReturnType<typeof makeWorkspace>>;
  let theirBlockId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mine = await makeWorkspace(db, 'task-mine');
    theirs = await makeWorkspace(db, 'task-theirs');

    // A paragraph in the other person's lecture note.
    const theirDoc = await ensureLectureNote(db, theirs.workspaceId, theirs.meeting.id);
    theirBlockId = randomUUID();
    await saveNoteDocument(db, theirs.workspaceId, theirDoc, {
      nodes: [
        {
          type: 'paragraph',
          attrs: { blockId: theirBlockId },
          content: [{ type: 'text', text: 'Not yours.' }],
        },
      ],
    });
  });

  afterAll(async () => {
    // The service-role client bypasses RLS, so these tests would pass on a
    // database with no policies at all — which is exactly why the check lives
    // in the service and is asserted here.
    if (db && mine?.userId) await db.auth.admin.deleteUser(mine.userId);
    if (db && theirs?.userId) await db.auth.admin.deleteUser(theirs.userId);
  });

  it('refuses a courseId from another workspace', async () => {
    await expect(
      createTask(db, {
        workspaceId: mine.workspaceId,
        title: 'Stolen course',
        courseId: theirs.courseId,
      })
    ).rejects.toThrow(/no course/);
  });

  it('refuses a meetingId from another workspace', async () => {
    await expect(
      createTask(db, {
        workspaceId: mine.workspaceId,
        title: 'Stolen lecture',
        meetingId: theirs.meeting.id,
      })
    ).rejects.toThrow(/no lecture/);
  });

  it('refuses a meeting that belongs to a different course than the task', async () => {
    await expect(
      createTask(db, {
        workspaceId: mine.workspaceId,
        title: 'Mismatched',
        courseId: mine.courseId,
        meetingId: theirs.meeting.id,
      })
    ).rejects.toThrow(/no lecture/);
  });

  it('refuses a unitId belonging to another course', async () => {
    await expect(
      createTask(db, {
        workspaceId: mine.workspaceId,
        title: 'Stolen unit',
        courseId: mine.courseId,
        unitId: theirs.unitId,
      })
    ).rejects.toThrow(/different course/);
  });

  it('refuses a unit with no course to check it against', async () => {
    await expect(
      createTask(db, {
        workspaceId: mine.workspaceId,
        title: 'Unit with no course',
        unitId: mine.unitId,
      })
    ).rejects.toThrow(/needs the course/);
  });

  it('refuses a sourceBlockId from another workspace', async () => {
    await expect(
      createTask(db, {
        workspaceId: mine.workspaceId,
        title: 'Stolen provenance',
        sourceBlockId: theirBlockId,
      })
    ).rejects.toThrow(/no block/);
  });

  it('applies the same checks on an edit, not only on create', async () => {
    const task = await createTask(db, {
      workspaceId: mine.workspaceId,
      title: 'Mine',
      courseId: mine.courseId,
    });

    await expect(
      updateTask(db, mine.workspaceId, task.id, { courseId: theirs.courseId })
    ).rejects.toThrow(/no course/);
    await expect(
      updateTask(db, mine.workspaceId, task.id, {
        courseId: mine.courseId,
        unitId: theirs.unitId,
      })
    ).rejects.toThrow(/different course/);
    await expect(
      updateTask(db, mine.workspaceId, task.id, { meetingId: theirs.meeting.id })
    ).rejects.toThrow(/no lecture/);
  });

  it('refuses to read, complete or delete another workspace\'s task', async () => {
    const theirTask = await createTask(db, {
      workspaceId: theirs.workspaceId,
      title: 'Theirs',
    });

    expect(await getTask(db, mine.workspaceId, theirTask.id)).toBeNull();
    await expect(
      setTaskStatus(db, mine.workspaceId, theirTask.id, 'done')
    ).rejects.toThrow(/no task/);
    await expect(deleteTask(db, mine.workspaceId, theirTask.id)).rejects.toThrow(/no task/);
    await expect(
      updateTask(db, mine.workspaceId, theirTask.id, { title: 'Hijacked' })
    ).rejects.toThrow(/no task/);

    // Still theirs, still untouched.
    const untouched = await getTask(db, theirs.workspaceId, theirTask.id);
    expect(untouched?.title).toBe('Theirs');
    expect(untouched?.status).toBe('open');
  });

  it('clears a unit that would be orphaned by moving the task to another course', async () => {
    const task = await createTask(db, {
      workspaceId: mine.workspaceId,
      title: 'Moving house',
      courseId: mine.courseId,
      unitId: mine.unitId,
      meetingId: mine.meeting.id,
    });
    expect(task.unit_id).toBe(mine.unitId);

    // No course at all: the unit and the lecture have nothing left to hang off.
    const moved = await updateTask(db, mine.workspaceId, task.id, { courseId: null });
    expect(moved.course_id).toBeNull();
    expect(moved.unit_id).toBeNull();
    expect(moved.meeting_id).toBeNull();
  });
});
