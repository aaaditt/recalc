import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createBlock } from '@/modules/blocks';
import {
  courseCodeForMeeting,
  getFilesForMeeting,
  removeFile,
  saveNoteImage,
  attachDriveFiles,
} from '@/modules/files';
import { getGoogleAccount } from '@/modules/google';
import { ensureWorkspace } from '@/modules/workspaces';

// The invariant of slice 09's database half:
//
//   a file reference lands on the lecture it was pointed at, and only ever on
//   ids the caller actually owns.
//
// `files` is the sixth table in a row whose writes take an id from the browser
// — courseId, meetingId and blockId all arrive from the page the attach button
// was pressed on — and the first five all shipped the same bug once
// (docs/DECISIONS.md: createOneOffMeeting in 04, createStandaloneNote in 05,
// modules/tasks in 06, modules/study in 07, modules/courses in 08). The RLS
// policy on `files` validates `workspace_id` and nothing else; it was never
// asked to prove the lecture a row points at belongs to that workspace too.
//
// Real database, throwaway users, deleted afterwards.
//
// The service-role client bypasses RLS, so every refusal below would pass on a
// database with no policies at all — which is the point: the check is in
// modules/files' `checkLinks`, not in Postgres. The last describe block signs
// in as a real user with the anon key and proves the RLS backstop separately.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error(
    'file-attachments.test.ts needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ' +
      'and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

/** A 1x1 PNG. Small enough to be a "pasted image", real enough to be stored. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
  0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
  0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

type Fixture = {
  userId: string;
  email: string;
  password: string;
  workspaceId: string;
  courseId: string;
  courseCode: string;
  meetingId: string;
  blockId: string;
};

/** A signed-up user with a workspace, a course, a lecture and a note block. */
async function makeWorkspace(db: SupabaseClient, label: string): Promise<Fixture> {
  const email = `${label}-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create test user: ${error.message}`);
  const userId = data.user.id;

  const workspaceId = (await ensureWorkspace(db, userId)).id;
  const courseCode = `ME${Math.floor(100 + Math.random() * 800)}`;

  const { data: course, error: cErr } = await db
    .from('courses')
    .insert({
      workspace_id: workspaceId,
      code: courseCode,
      name: 'Thermodynamics II',
      term: 'Fall 2026',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`could not create course: ${cErr.message}`);

  const { data: meeting, error: mErr } = await db
    .from('class_meetings')
    .insert({
      workspace_id: workspaceId,
      course_id: course.id,
      starts_at: '2026-10-14T05:00:00.000Z',
      ends_at: '2026-10-14T06:30:00.000Z',
      room: 'B204',
    })
    .select('id')
    .single();
  if (mErr) throw new Error(`could not create meeting: ${mErr.message}`);

  const block = await createBlock(db, {
    workspaceId,
    type: 'note',
    content: { text: 'Lecture note' },
  });

  return {
    userId,
    email,
    password,
    workspaceId,
    courseId: course.id as string,
    courseCode,
    meetingId: meeting.id as string,
    blockId: block.id,
  };
}

/**
 * Delete the user, and everything under it.
 *
 * Deleting the auth user cascades through `workspaces` to every table — but
 * NOT to Supabase Storage, which has no foreign key to anything. So the bucket
 * is swept by hand, or every run of the suite leaves a few stray PNGs behind
 * in the live project. (Booked in docs/DECISIONS.md under "Noticed, not
 * fixed": the app has the same gap if a workspace is ever deleted for real.)
 */
async function tearDown(db: SupabaseClient, fixture: Fixture | undefined) {
  if (!fixture) return;

  const { data } = await db.storage.from('note-images').list(fixture.workspaceId, {
    limit: 1000,
  });
  const paths = (data ?? []).map((entry) => `${fixture.workspaceId}/${entry.name}`);
  if (paths.length > 0) await db.storage.from('note-images').remove(paths);

  await db.auth.admin.deleteUser(fixture.userId);
}

// ---------------------------------------------------------------------------

describe('a pasted image becomes a file on the lecture it was pasted into', () => {
  let db: SupabaseClient;
  let mine: Fixture;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    mine = await makeWorkspace(db, 'files-mine');
  });

  afterAll(async () => {
    if (db) await tearDown(db, mine);
  });

  it('stores the bytes in Supabase Storage, not in Postgres', async () => {
    const file = await saveNoteImage(db, {
      workspaceId: mine.workspaceId,
      meetingId: mine.meetingId,
      courseId: mine.courseId,
      name: 'whiteboard.png',
      mimeType: 'image/png',
      bytes: PNG,
    });

    expect(file.provider).toBe('supabase');
    expect(file.size_bytes).toBe(PNG.byteLength);
    // The path is the ownership check the Storage policy in migration 005 runs.
    expect(file.provider_id.startsWith(`${mine.workspaceId}/`)).toBe(true);
    // A reference, never the bytes.
    expect(JSON.stringify(file)).not.toContain('IHDR');
    // Private bucket, so the page gets a signed URL rather than a public one.
    expect(file.viewUrl).toContain('token=');
    expect(file.driveUrl).toBeNull();
  });

  it('shows up on that lecture, and on no other', async () => {
    const files = await getFilesForMeeting(db, mine.workspaceId, mine.meetingId);
    expect(files.map((file) => file.name)).toEqual(['whiteboard.png']);

    expect(await getFilesForMeeting(db, mine.workspaceId, randomUUID())).toEqual([]);
  });

  it('refuses an image that is not an image, and one that is empty', async () => {
    await expect(
      saveNoteImage(db, {
        workspaceId: mine.workspaceId,
        meetingId: mine.meetingId,
        name: 'slides.pptx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes: PNG,
      })
    ).rejects.toThrow(/only images/);

    await expect(
      saveNoteImage(db, {
        workspaceId: mine.workspaceId,
        meetingId: mine.meetingId,
        name: 'empty.png',
        mimeType: 'image/png',
        bytes: new Uint8Array(0),
      })
    ).rejects.toThrow(/empty/);
  });

  it('refuses an image too big to be a pasted one — that is a Drive file', async () => {
    await expect(
      saveNoteImage(db, {
        workspaceId: mine.workspaceId,
        meetingId: mine.meetingId,
        name: 'scan.png',
        mimeType: 'image/png',
        bytes: new Uint8Array(6 * 1024 * 1024),
      })
    ).rejects.toThrow(/too big/);
  });

  it('names the folder a Drive upload would go in, from the lecture itself', async () => {
    expect(await courseCodeForMeeting(db, mine.workspaceId, mine.meetingId)).toBe(
      mine.courseCode
    );
  });

  it('removing a stored image takes the row and the object with it', async () => {
    const [file] = await getFilesForMeeting(db, mine.workspaceId, mine.meetingId);
    await removeFile(db, mine.workspaceId, file.id);

    expect(await getFilesForMeeting(db, mine.workspaceId, mine.meetingId)).toEqual([]);

    // The object is gone from the bucket too — nothing else pointed at it.
    const { data } = await db.storage
      .from('note-images')
      .list(mine.workspaceId, { limit: 100 });
    expect(data ?? []).toEqual([]);
  });

  it('has no Google account connected, and says so instead of failing', async () => {
    expect(await getGoogleAccount(db, mine.userId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('a client-supplied id must belong to the caller', () => {
  let db: SupabaseClient;
  let mine: Fixture;
  let theirs: Fixture;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mine = await makeWorkspace(db, 'files-a');
    theirs = await makeWorkspace(db, 'files-b');
  });

  afterAll(async () => {
    if (db) await tearDown(db, mine);
    if (db) await tearDown(db, theirs);
  });

  function image(links: Record<string, string>) {
    return {
      workspaceId: mine.workspaceId,
      name: 'whiteboard.png',
      mimeType: 'image/png',
      bytes: PNG,
      ...links,
    };
  }

  it('refuses a meetingId from another workspace', async () => {
    await expect(saveNoteImage(db, image({ meetingId: theirs.meetingId }))).rejects.toThrow(
      /no lecture/
    );
  });

  it('refuses a courseId from another workspace', async () => {
    await expect(saveNoteImage(db, image({ courseId: theirs.courseId }))).rejects.toThrow(
      /no course/
    );
  });

  it('refuses a blockId from another workspace', async () => {
    await expect(saveNoteImage(db, image({ blockId: theirs.blockId }))).rejects.toThrow(
      /no block/
    );
  });

  it('refuses my own lecture filed under a different course', async () => {
    const { data: other } = await db
      .from('courses')
      .insert({
        workspace_id: mine.workspaceId,
        code: 'MA202',
        name: 'Linear Algebra',
        term: 'Fall 2026',
      })
      .select('id')
      .single();

    await expect(
      saveNoteImage(
        db,
        image({ meetingId: mine.meetingId, courseId: (other as { id: string }).id })
      )
    ).rejects.toThrow(/different course/);
  });

  it('refuses to name the Drive folder of another workspace\'s lecture', async () => {
    await expect(
      courseCodeForMeeting(db, mine.workspaceId, theirs.meetingId)
    ).rejects.toThrow(/no lecture/);
  });

  it('checks the links before it ever asks Google about a file id', async () => {
    // No Google account is connected in this workspace, so if `checkLinks` ran
    // second this would fail with "no Google account" rather than "no lecture"
    // — and a caller could learn which Drive file ids exist by watching which
    // error came back. It runs first, so a foreign lecture is refused outright.
    await expect(
      attachDriveFiles(db, {
        workspaceId: mine.workspaceId,
        userId: mine.userId,
        fileIds: ['some-drive-file-id'],
        meetingId: theirs.meetingId,
      })
    ).rejects.toThrow(/no lecture/);
  });

  it('refuses to remove another workspace\'s file', async () => {
    const theirFile = await saveNoteImage(db, {
      workspaceId: theirs.workspaceId,
      meetingId: theirs.meetingId,
      name: 'theirs.png',
      mimeType: 'image/png',
      bytes: PNG,
    });

    await expect(removeFile(db, mine.workspaceId, theirFile.id)).rejects.toThrow(/no file/);

    // Still theirs, still there.
    expect(
      (await getFilesForMeeting(db, theirs.workspaceId, theirs.meetingId)).map((f) => f.id)
    ).toEqual([theirFile.id]);
  });

  it('wrote nothing at all while refusing — neither workspace gained a file', async () => {
    expect(await getFilesForMeeting(db, mine.workspaceId, mine.meetingId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('RLS is the backstop under all of that', () => {
  let db: SupabaseClient;
  let mine: Fixture;
  let theirs: Fixture;
  /** The anon key, signed in as `mine` — exactly what the browser gets. */
  let asMe: SupabaseClient;
  let theirFileId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mine = await makeWorkspace(db, 'files-rls-a');
    theirs = await makeWorkspace(db, 'files-rls-b');

    theirFileId = (
      await saveNoteImage(db, {
        workspaceId: theirs.workspaceId,
        meetingId: theirs.meetingId,
        name: 'theirs.png',
        mimeType: 'image/png',
        bytes: PNG,
      })
    ).id;

    // A Google account for them, so the token row can be probed too.
    const { error } = await db.from('google_accounts').insert({
      user_id: theirs.userId,
      address: 'someone@example.com',
      refresh_token_enc: 'v1.aaaa.bbbb.cccc',
      granted_scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    if (error) throw new Error(`could not seed a google account: ${error.message}`);

    asMe = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await asMe.auth.signInWithPassword({
      email: mine.email,
      password: mine.password,
    });
    if (signIn.error) throw new Error(`could not sign in: ${signIn.error.message}`);
  });

  afterAll(async () => {
    if (asMe) await asMe.auth.signOut();
    if (db) await tearDown(db, mine);
    if (db) await tearDown(db, theirs);
  });

  it('lets me read my own files', async () => {
    await saveNoteImage(db, {
      workspaceId: mine.workspaceId,
      meetingId: mine.meetingId,
      name: 'mine.png',
      mimeType: 'image/png',
      bytes: PNG,
    });

    const { data, error } = await asMe.from('files').select('name');
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.name)).toEqual(['mine.png']);
  });

  it('hides another workspace\'s files completely', async () => {
    const { data, error } = await asMe.from('files').select('id').eq('id', theirFileId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuses to write a file row into another workspace', async () => {
    const { error } = await asMe.from('files').insert({
      workspace_id: theirs.workspaceId,
      provider: 'supabase',
      provider_id: `${theirs.workspaceId}/forged.png`,
      name: 'forged.png',
    });
    expect(error).not.toBeNull();
  });

  it('refuses to delete another workspace\'s file', async () => {
    await asMe.from('files').delete().eq('id', theirFileId);

    // Still there, under the service-role client that can actually see it.
    const { data } = await db.from('files').select('id').eq('id', theirFileId);
    expect((data ?? []).length).toBe(1);
  });

  it('never shows me another user\'s Google token', async () => {
    const { data, error } = await asMe.from('google_accounts').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuses to write a Google account row for another user', async () => {
    const { error } = await asMe.from('google_accounts').insert({
      user_id: theirs.userId,
      address: 'forged@example.com',
      refresh_token_enc: 'v1.a.b.c',
    });
    expect(error).not.toBeNull();
  });
});
