// The arithmetic of the files screen: where a dropped file should go, what a
// tile should say, and which files can be opened in place.
//
// It lives here rather than in a component or a Server Component for the same
// reason lib/today.ts, lib/calendar.ts, lib/tasks.ts and lib/study.ts do: these
// are the parts that can be silently wrong, and a Server Component cannot be
// unit-tested. lib/files.test.ts is the test.

/**
 * The line between "a file I would go looking for in Drive" and "a picture I
 * pasted into a note".
 *
 * prompts/09-drive.md point 6: small pasted images go to Supabase Storage, not
 * Drive. 5MB is the bucket's own limit in migration 005 and a generous ceiling
 * for a phone photo of a whiteboard pasted mid-lecture; anything above it is a
 * scan or a deck, and belongs in Drive where it can be found again.
 */
export const SMALL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type FileStore = 'drive' | 'supabase';

/**
 * Which store a newly added file belongs in.
 *
 * A small image → Supabase Storage; everything else → Drive. With no Drive
 * connected the answer for "everything else" is still `drive`, and the caller
 * shows the connect prompt rather than quietly putting a 40MB deck somewhere
 * it will never be found.
 */
export function storeFor(input: { mimeType: string | null; sizeBytes: number }): FileStore {
  return isImage(input.mimeType) && input.sizeBytes <= SMALL_IMAGE_MAX_BYTES
    ? 'supabase'
    : 'drive';
}

export function isImage(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

export function isPdf(mimeType: string | null | undefined): boolean {
  return mimeType === 'application/pdf';
}

/** Can this be shown inside the app, or does it have to open in Drive? */
export function opensInPlace(mimeType: string | null | undefined): boolean {
  return isImage(mimeType) || isPdf(mimeType);
}

/**
 * A size a person can read. Deliberately coarse — nobody needs three decimal
 * places to know whether a deck is worth downloading on mobile data.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;

  return `${(mb / 1024).toFixed(1)} GB`;
}

/**
 * The two or three characters drawn on a tile that has no thumbnail.
 *
 * A missing thumbnail is not an error (prompts/09-drive.md point 7) — it is a
 * tile with the extension on it.
 */
export function fileBadge(name: string, mimeType: string | null | undefined): string {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : '';

  if (extension !== '' && extension.length <= 4) return extension.toUpperCase();
  if (isPdf(mimeType)) return 'PDF';
  if (isImage(mimeType)) return 'IMG';
  return 'FILE';
}

/** The folder a course's uploads land in: `Recalc/ME301/`. */
export function recalcFolderPath(courseCode: string | null | undefined): string {
  const code = courseCode?.trim().replace(/[\\/]/g, '-') ?? '';
  return code === '' ? 'Recalc/' : `Recalc/${code}/`;
}
