import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SMALL_IMAGE_MAX_BYTES, isImage, opensInPlace } from '@/lib/files';
import { getBlock } from '@/modules/blocks';
import { getCourse, getMeeting } from '@/modules/courses';
import { getDriveFile } from '@/modules/google';

import * as repo from './repo';
import {
  attachDriveFilesInputSchema,
  saveImageInputSchema,
  type AttachDriveFilesInput,
  type FileRow,
  type FileView,
  type SaveImageInput,
} from './schema';

// ---------------------------------------------------------------------------
// Ownership of the ids a client supplies
//
// `workspaceId` is never forgeable: every caller derives it from the session.
// `courseId`, `meetingId` and `blockId` are the opposite — they come from the
// page the attach button was pressed on, and the `files` RLS policy only ever
// validates `workspace_id`. It was never asked to prove that the lecture a row
// points at belongs to that workspace too.
//
// Five bugs of exactly this shape were found in earlier slices:
// `createOneOffMeeting` (04), `createStandaloneNote` (05), the four ids
// modules/tasks takes (06), modules/study's two (07), and modules/courses'
// syllabus writes (08). All are in docs/DECISIONS.md. This module follows the
// same answer: one shared `checkLinks` that every write runs, so no call site
// can forget it, because no call site performs it.
// ---------------------------------------------------------------------------

type Links = {
  courseId?: string | null;
  meetingId?: string | null;
  blockId?: string | null;
};

type CheckedLinks = {
  courseId: string | null;
  meetingId: string | null;
  blockId: string | null;
};

async function checkLinks(
  db: SupabaseClient,
  workspaceId: string,
  links: Links
): Promise<CheckedLinks> {
  const courseId = links.courseId ?? null;
  const meetingId = links.meetingId ?? null;
  const blockId = links.blockId ?? null;

  if (courseId !== null) {
    const course = await getCourse(db, workspaceId, courseId);
    if (!course) {
      throw new Error(`files: no course ${courseId} in this workspace`);
    }
  }

  if (meetingId !== null) {
    const meeting = await getMeeting(db, workspaceId, meetingId);
    if (!meeting) {
      throw new Error(`files: no lecture ${meetingId} in this workspace`);
    }
    // A file filed under a lecture of a different course is a file that will
    // never be found again.
    if (courseId !== null && meeting.course_id !== courseId) {
      throw new Error('files: that lecture belongs to a different course');
    }
  }

  if (blockId !== null) {
    const block = await getBlock(db, blockId);
    if (!block || block.workspace_id !== workspaceId) {
      throw new Error(`files: no block ${blockId} in this workspace`);
    }
  }

  return { courseId, meetingId, blockId };
}

/**
 * The course code a lecture's uploads should be filed under, proved through the
 * lecture's own row rather than believed from the browser.
 *
 * This is what `Recalc/<course code>/` is built from, so it is the one place
 * that has to be right — a code taken from a form would let a caller write into
 * another course's folder.
 */
export async function courseCodeForMeeting(
  db: SupabaseClient,
  workspaceId: string,
  meetingId: string
): Promise<string | null> {
  const meeting = await getMeeting(db, workspaceId, meetingId);
  if (!meeting) throw new Error(`files: no lecture ${meetingId} in this workspace`);

  const course = await getCourse(db, workspaceId, meeting.course_id);
  return course?.code ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Record files the user picked in the Google Picker, or uploaded to Drive.
 *
 * Only the ids come from the browser. Everything stored beside them — name,
 * mime type, size, links — is read from Drive with this user's own token, so a
 * forged form cannot put a made-up filename on the lecture page, and a file id
 * the user never granted access to simply is not found.
 *
 * Idempotent per attachment: pressing Attach twice on the same deck returns the
 * row that is already there instead of showing it twice.
 */
export async function attachDriveFiles(
  db: SupabaseClient,
  input: AttachDriveFilesInput
): Promise<FileView[]> {
  const parsed = attachDriveFilesInputSchema.parse(input);
  const links = await checkLinks(db, parsed.workspaceId, parsed);

  const rows: FileRow[] = [];

  // Sequential on purpose: this is at most a handful of files, and a burst of
  // parallel Drive calls is a good way to be rate-limited for no gain.
  for (const fileId of parsed.fileIds) {
    const file = await getDriveFile(db, parsed.userId, fileId);

    const already = await repo.findAttachment(db, parsed.workspaceId, {
      provider: 'drive',
      providerId: file.id,
      ...links,
    });
    if (already) {
      rows.push(already);
      continue;
    }

    rows.push(
      await repo.insert(db, {
        workspace_id: parsed.workspaceId,
        course_id: links.courseId,
        meeting_id: links.meetingId,
        block_id: links.blockId,
        provider: 'drive',
        provider_id: file.id,
        name: file.name,
        mime_type: file.mimeType,
        size_bytes: file.size === null ? null : Number(file.size),
        web_view_link: file.webViewLink,
        thumbnail_link: file.thumbnailLink,
      })
    );
  }

  return withUrls(db, rows);
}

/**
 * Store a small pasted image in Supabase Storage.
 *
 * prompts/09-drive.md point 6: "Drive is for files I would want to find in
 * Drive." A screenshot pasted into a lecture note is not one of those, so it
 * goes in a private bucket keyed by workspace and is served through a signed
 * URL. It also means pasting a picture works with no Drive account connected
 * at all.
 */
export async function saveNoteImage(
  db: SupabaseClient,
  input: SaveImageInput
): Promise<FileView> {
  const parsed = saveImageInputSchema.parse(input);

  if (!isImage(parsed.mimeType)) {
    throw new Error('files: only images go to Supabase Storage; everything else is Drive');
  }
  if (parsed.bytes.byteLength === 0) {
    throw new Error('files: that image is empty');
  }
  if (parsed.bytes.byteLength > SMALL_IMAGE_MAX_BYTES) {
    throw new Error(
      'files: that image is too big for a note — attach it to the lecture instead, ' +
        'which puts it in Drive'
    );
  }

  const links = await checkLinks(db, parsed.workspaceId, parsed);

  // `<workspace id>/<uuid>.<ext>` — the first path segment is what the Storage
  // RLS policy in migration 005 checks, so the path IS the ownership check.
  const extension = extensionFor(parsed.name, parsed.mimeType);
  const path = `${parsed.workspaceId}/${randomUUID()}${extension}`;

  await repo.uploadImage(db, path, parsed.bytes, parsed.mimeType);

  const row = await repo.insert(db, {
    workspace_id: parsed.workspaceId,
    course_id: links.courseId,
    meeting_id: links.meetingId,
    block_id: links.blockId,
    provider: 'supabase',
    provider_id: path,
    name: parsed.name,
    mime_type: parsed.mimeType,
    size_bytes: parsed.bytes.byteLength,
    web_view_link: null,
    thumbnail_link: null,
  });

  return (await withUrls(db, [row]))[0];
}

/**
 * Take the file off this lecture.
 *
 * A Drive file is NEVER deleted from Drive — prompts/09-drive.md point 5 makes
 * that a hard rule, and this function is the only place it could be broken. All
 * that goes is the reference; the deck is still in `Recalc/ME301/` afterwards.
 *
 * An image this app put in Supabase Storage is the other case: nothing else
 * points at it and there is no "Storage" the user browses, so the object goes
 * too rather than becoming an orphan nobody can see or delete.
 */
export async function removeFile(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<void> {
  const file = await repo.find(db, workspaceId, id);
  if (!file) throw new Error(`files: no file ${id} in this workspace`);

  if (file.provider === 'supabase') {
    await repo.removeImage(db, file.provider_id);
  }

  await repo.remove(db, workspaceId, id);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getFile(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<FileRow | null> {
  return repo.find(db, workspaceId, id);
}

export async function getFilesForMeeting(
  db: SupabaseClient,
  workspaceId: string,
  meetingId: string
): Promise<FileView[]> {
  return withUrls(db, await repo.listForMeeting(db, workspaceId, meetingId));
}

export async function getFilesForCourse(
  db: SupabaseClient,
  workspaceId: string,
  courseId: string
): Promise<FileView[]> {
  return withUrls(db, await repo.listForCourse(db, workspaceId, courseId));
}

export async function getFilesForBlock(
  db: SupabaseClient,
  workspaceId: string,
  blockId: string
): Promise<FileView[]> {
  return withUrls(db, await repo.listForBlock(db, workspaceId, blockId));
}

// ---------------------------------------------------------------------------

function extensionFor(name: string, mimeType: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    const found = name.slice(dot).toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(found)) return found;
  }

  const subtype = mimeType.split('/')[1] ?? '';
  return /^[a-z0-9]{1,5}$/.test(subtype) ? `.${subtype}` : '';
}

/**
 * Add the two URLs a screen needs.
 *
 * A Drive file is served through this app's own `/api/drive/[fileId]` route —
 * never a Google URL with a token on it, because a component may not hold a
 * credential (CLAUDE.md's Never rule 4). A stored image gets a signed Supabase
 * URL, which expires on its own.
 */
async function withUrls(db: SupabaseClient, rows: FileRow[]): Promise<FileView[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (row.provider === 'drive') {
        const base = `/api/drive/${encodeURIComponent(row.provider_id)}`;
        return {
          ...row,
          viewUrl: opensInPlace(row.mime_type) ? base : null,
          thumbnailUrl: row.thumbnail_link ? `${base}?thumb=1` : null,
          driveUrl: row.web_view_link,
        };
      }

      const signed = await repo.signedImageUrl(db, row.provider_id);
      return { ...row, viewUrl: signed, thumbnailUrl: signed, driveUrl: null };
    })
  );
}
