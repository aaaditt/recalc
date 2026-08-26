import {
  DriveFileGone,
  GoogleReconnectRequired,
  driveFileSchema,
  type DriveFile,
} from './schema';

// Drive v3, over plain fetch. No `googleapis` SDK — see docs/DECISIONS.md.
//
// Everything here runs with a drive.file access token, which means Drive will
// only ever answer about two kinds of file: ones this app created, and ones the
// user handed it through the Google Picker. That is not a rule this file
// enforces; it is what the scope makes true (docs/SCHEMA.md, "Google scopes").
//
// Uploading is deliberately NOT here. The browser uploads straight to Google
// with a short-lived token, so a 40MB slide deck never travels through this
// app's server — see docs/DECISIONS.md.

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const ABOUT_ENDPOINT = 'https://www.googleapis.com/drive/v3/about';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** The fields every read asks for — exactly the columns `files` stores. */
const FILE_FIELDS = 'id,name,mimeType,size,webViewLink,thumbnailLink,trashed';

/** The Drive folder everything this app uploads lives under. */
export const ROOT_FOLDER_NAME = 'Recalc';

async function driveFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  // 401 means the token is not good any more. The caller has just minted it, so
  // this is a revoked grant rather than an expiry.
  if (response.status === 401) throw new GoogleReconnectRequired();
  if (response.status === 403) {
    const body = await response.text();
    // insufficientScopes: the connection predates a feature that needs more.
    if (body.includes('insufficient')) {
      throw new GoogleReconnectRequired(
        'Google Drive needs reconnecting — this app was not granted access to that file.'
      );
    }
    throw new Error(`drive: 403 ${body.slice(0, 200)}`);
  }
  if (response.status === 404) throw new DriveFileGone();

  return response;
}

async function driveJson<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await driveFetch(accessToken, url, init);
  if (!response.ok) {
    throw new Error(`drive: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

/**
 * Which Google account this token belongs to.
 *
 * Used once, at connect time, to record the address — and it works with
 * drive.file alone, so the app never has to ask for an email or profile scope
 * just to be able to say which account is connected.
 */
export async function getAccountAddress(accessToken: string): Promise<string> {
  const about = await driveJson<{ user?: { emailAddress?: string } }>(
    accessToken,
    `${ABOUT_ENDPOINT}?fields=user(emailAddress)`
  );
  const address = about.user?.emailAddress;
  if (!address) throw new Error('drive: Google did not say which account this is');
  return address;
}

/** One file's metadata. Throws `DriveFileGone` when Drive has never heard of it. */
export async function getFile(accessToken: string, fileId: string): Promise<DriveFile> {
  const raw = await driveJson<unknown>(
    accessToken,
    `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`
  );
  const file = driveFileSchema.parse(raw);
  // A trashed file is still returned by the API. To this app it is gone.
  if (file.trashed) throw new DriveFileGone();
  return file;
}

/** Escape a value for Drive's `q` query language: backslash and single quote. */
function quote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const query = [
    `name = '${quote(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
    parentId ? `'${quote(parentId)}' in parents` : "'root' in parents",
  ].join(' and ');

  const url =
    `${FILES_ENDPOINT}?q=${encodeURIComponent(query)}` +
    '&fields=files(id,name)&pageSize=1&spaces=drive';

  const result = await driveJson<{ files?: Array<{ id?: string }> }>(accessToken, url);
  return result.files?.[0]?.id ?? null;
}

async function createFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string> {
  const created = await driveJson<{ id?: string }>(
    accessToken,
    `${FILES_ENDPOINT}?fields=id`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      }),
    }
  );
  if (!created.id) throw new Error(`drive: could not create the folder "${name}"`);
  return created.id;
}

/**
 * Find or create a folder path, one segment at a time, returning the last id.
 *
 * `['Recalc', 'ME301']` is `Recalc/ME301/` in the user's Drive, created on
 * first use — which is prompts/09-drive.md point 4, and the thing the slice's
 * definition of done asks to see in the real Drive afterwards.
 *
 * The lookup only ever finds folders this app created: drive.file grants access
 * to nothing else, so a folder called `Recalc` that the user made themselves is
 * invisible here and a second one is created beside it. That is a real
 * consequence of the scope and the right trade — the alternative is asking for
 * access to the whole Drive.
 */
export async function ensureFolderPath(
  accessToken: string,
  segments: string[]
): Promise<string> {
  let parentId: string | null = null;

  for (const segment of segments) {
    const found: string | null = await findFolder(accessToken, segment, parentId);
    parentId = found ?? (await createFolder(accessToken, segment, parentId));
  }

  if (!parentId) throw new Error('drive: ensureFolderPath was given no path');
  return parentId;
}

/**
 * The file's bytes, streamed.
 *
 * Used by the in-place viewer, so an image or a PDF opens inside the app rather
 * than bouncing to Drive. The response is handed straight back to the browser;
 * nothing is written down.
 */
export async function downloadFile(
  accessToken: string,
  fileId: string
): Promise<Response> {
  const response = await driveFetch(
    accessToken,
    `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`
  );
  if (!response.ok) {
    throw new Error(`drive: ${response.status} downloading ${fileId}`);
  }
  return response;
}

/**
 * A thumbnail, if Drive has one.
 *
 * Returns null rather than throwing when there is nothing to show — a missing
 * thumbnail is not an error (prompts/09-drive.md point 7), it is a tile with
 * the file's name on it.
 */
export async function downloadThumbnail(
  accessToken: string,
  thumbnailLink: string
): Promise<Response | null> {
  const response = await fetch(thumbnailLink, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return response.ok ? response : null;
}
