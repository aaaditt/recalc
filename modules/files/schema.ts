import { z } from 'zod';

// A `files` row is a REFERENCE. docs/SCHEMA.md: "Big things (recordings,
// scanned PDFs, slide decks) go to Drive; small pasted images go to Supabase
// Storage. Store the reference, never the bytes."
//
// So `provider_id` is a Drive file id, or an object path inside the
// `note-images` bucket, and nothing in this table is ever the file itself.

export const fileProviderSchema = z.enum(['drive', 'supabase']);

export const fileSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  course_id: z.uuid().nullable(),
  meeting_id: z.uuid().nullable(),
  block_id: z.uuid().nullable(),
  provider: fileProviderSchema,
  provider_id: z.string(),
  name: z.string(),
  mime_type: z.string().nullable(),
  // bigint comes back as a number from PostgREST at these sizes.
  size_bytes: z.number().nullable(),
  web_view_link: z.string().nullable(),
  thumbnail_link: z.string().nullable(),
  created_at: z.string(),
});

/** Where an attachment hangs: a lecture, a course, a note block, or nothing. */
export const attachmentLinksSchema = z.object({
  courseId: z.uuid().nullable().optional(),
  meetingId: z.uuid().nullable().optional(),
  blockId: z.uuid().nullable().optional(),
});

/**
 * Attach files the user picked in the Google Picker.
 *
 * Only the ids arrive from the browser. Every other field — the name, the mime
 * type, the size, the links — is read from Drive server-side, because a form
 * can say anything and a Drive file id is the only part of it Google will
 * confirm.
 */
export const attachDriveFilesInputSchema = attachmentLinksSchema.extend({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  fileIds: z.array(z.string().min(1)).min(1).max(20),
});

/** A small pasted image, on its way to Supabase Storage. */
export const saveImageInputSchema = attachmentLinksSchema.extend({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(200),
  mimeType: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
});

export type FileRow = z.infer<typeof fileSchema>;
export type FileProvider = z.infer<typeof fileProviderSchema>;
export type AttachmentLinks = z.infer<typeof attachmentLinksSchema>;
export type AttachDriveFilesInput = z.input<typeof attachDriveFilesInputSchema>;
export type SaveImageInput = z.input<typeof saveImageInputSchema>;

/**
 * A file as a screen sees it.
 *
 * `viewUrl` is a signed Supabase URL for a pasted image and a route on this app
 * for a Drive file — never a raw Google URL with a token in it, and never
 * anything a component has to hold a credential to use.
 */
export type FileView = FileRow & {
  /** Opens the bytes in place: an <img> src, or an iframe for a PDF. */
  viewUrl: string | null;
  /** Small preview, or null. A null thumbnail is a tile, not an error. */
  thumbnailUrl: string | null;
  /** Where "Open in Drive" goes. Null for a Supabase-stored image. */
  driveUrl: string | null;
};
