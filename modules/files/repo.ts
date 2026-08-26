import type { SupabaseClient } from '@supabase/supabase-js';

import { fileSchema, type FileRow } from './schema';

// The only file that touches the `files` table and the `note-images` bucket.
//
// Storage is in here rather than in a component or a page for the same reason
// the table is (CLAUDE.md's Never rule 2): it is the app's data, and there is
// one place that reaches for it.

/** The private bucket created in migration 005. */
export const IMAGE_BUCKET = 'note-images';

/** Long enough to read a lecture page and open something on it. */
const SIGNED_URL_SECONDS = 60 * 60;

export type NewFileRow = {
  workspace_id: string;
  course_id: string | null;
  meeting_id: string | null;
  block_id: string | null;
  provider: string;
  provider_id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  web_view_link: string | null;
  thumbnail_link: string | null;
};

export async function insert(db: SupabaseClient, row: NewFileRow): Promise<FileRow> {
  const { data, error } = await db.from('files').insert(row).select('*').single();
  if (error) throw new Error(`files.insert: ${error.message}`);
  return fileSchema.parse(data);
}

/** One file by id, or null when it is not this workspace's. */
export async function find(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<FileRow | null> {
  const { data, error } = await db
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`files.find: ${error.message}`);
  return data ? fileSchema.parse(data) : null;
}

/**
 * The row for this exact attachment, if there already is one.
 *
 * "This exact attachment" means the same file hanging in the same place — the
 * same deck attached to two different lectures is two rows, on purpose.
 */
export async function findAttachment(
  db: SupabaseClient,
  workspaceId: string,
  where: {
    provider: string;
    providerId: string;
    courseId: string | null;
    meetingId: string | null;
    blockId: string | null;
  }
): Promise<FileRow | null> {
  let query = db
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', where.provider)
    .eq('provider_id', where.providerId);

  query = where.courseId === null ? query.is('course_id', null) : query.eq('course_id', where.courseId);
  query = where.meetingId === null ? query.is('meeting_id', null) : query.eq('meeting_id', where.meetingId);
  query = where.blockId === null ? query.is('block_id', null) : query.eq('block_id', where.blockId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`files.findAttachment: ${error.message}`);
  return data ? fileSchema.parse(data) : null;
}

/** Everything attached to one lecture, newest first. */
export async function listForMeeting(
  db: SupabaseClient,
  workspaceId: string,
  meetingId: string
): Promise<FileRow[]> {
  const { data, error } = await db
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`files.listForMeeting: ${error.message}`);
  return (data ?? []).map((row) => fileSchema.parse(row));
}

/** Everything attached to one course, newest first. */
export async function listForCourse(
  db: SupabaseClient,
  workspaceId: string,
  courseId: string
): Promise<FileRow[]> {
  const { data, error } = await db
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`files.listForCourse: ${error.message}`);
  return (data ?? []).map((row) => fileSchema.parse(row));
}

/** Everything attached to one note block, newest first. */
export async function listForBlock(
  db: SupabaseClient,
  workspaceId: string,
  blockId: string
): Promise<FileRow[]> {
  const { data, error } = await db
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('block_id', blockId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`files.listForBlock: ${error.message}`);
  return (data ?? []).map((row) => fileSchema.parse(row));
}

/** Remove the reference. Nothing in Drive is touched — see the service. */
export async function remove(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<void> {
  const { error } = await db
    .from('files')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', id);
  if (error) throw new Error(`files.remove: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Supabase Storage — the note-images bucket
// ---------------------------------------------------------------------------

export async function uploadImage(
  db: SupabaseClient,
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { error } = await db.storage
    .from(IMAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`files.uploadImage: ${error.message}`);
}

/**
 * A short-lived URL for a stored image.
 *
 * The bucket is private, so this is how a pasted whiteboard photo gets onto the
 * page. Null rather than throwing when the object has gone — a missing image is
 * a tile, not an error page.
 */
export async function signedImageUrl(
  db: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await db.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Delete a stored image. Only ever called for objects this app wrote. */
export async function removeImage(db: SupabaseClient, path: string): Promise<void> {
  // Deliberately not fatal: the row is going either way, and a leftover object
  // in a private bucket is a tidiness problem, not a correctness one.
  await db.storage.from(IMAGE_BUCKET).remove([path]);
}
