// Browser-side Google: the Picker, and uploading straight to Drive.
//
// There is no secret in this file and there must never be one (CLAUDE.md's
// Never rule 4). Every credential it uses is passed in as an argument at the
// moment of a click: a short-lived `drive.file` access token minted by a server
// action, and the Picker's developer key, which is a NEXT_PUBLIC value that
// grants nothing on its own.
//
// Why the browser talks to Google directly at all:
//
//   - The Picker only exists as browser JavaScript, and it is the thing that
//     grants this app access to a file. Without it, `drive.file` can only ever
//     see files the app itself created.
//   - Uploading from here means a 40MB slide deck never travels through this
//     app's server, so there is no request-body limit to hit and nothing to
//     store on the way past.
//
// No `googleapis` SDK and no picker wrapper package — see docs/DECISIONS.md.

const GAPI_SRC = 'https://apis.google.com/js/api.js';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

/** Google's own cut-off for a one-request upload. Above it, resumable. */
const MULTIPART_MAX_BYTES = 5 * 1024 * 1024;

// The shape of the bits of Google's global we actually call. Deliberately
// small: a full typing of the Picker API would be a dependency in all but name.
type PickerDoc = { id?: string };
type PickerResult = { action?: string; docs?: PickerDoc[] };

type PickerBuilder = {
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  enableFeature(feature: unknown): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

type GooglePicker = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: unknown) => {
    setIncludeFolders(on: boolean): unknown;
    setSelectFolderEnabled(on: boolean): unknown;
    setMode(mode: unknown): unknown;
  };
  DocsUploadView: new () => unknown;
  ViewId: { DOCS: unknown };
  DocsViewMode: { GRID: unknown };
  Feature: { MULTISELECT_ENABLED: unknown };
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
};

declare global {
  interface Window {
    gapi?: { load(name: string, callback: () => void): void };
    google?: { picker?: GooglePicker };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGapi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.picker) return Promise.resolve();

  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GAPI_SRC}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () =>
      reject(new Error('Could not load Google from apis.google.com.'))
    );

    if (!existing) {
      script.src = GAPI_SRC;
      script.async = true;
      document.head.append(script);
    }
  }).then(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!window.gapi) {
          reject(new Error('Google loaded but the picker did not.'));
          return;
        }
        window.gapi.load('picker', () => resolve());
      })
  );

  return scriptPromise;
}

export type PickerOptions = {
  /** Short-lived drive.file access token, minted server-side on click. */
  accessToken: string;
  /** NEXT_PUBLIC_GOOGLE_PICKER_API_KEY. Public by design. */
  developerKey: string;
  /** The Cloud project number, taken from the OAuth client id. */
  appId: string;
};

/**
 * Open the Google Picker and resolve with the ids of whatever was chosen.
 *
 * An empty array means the user cancelled, which is not an error. Only ids come
 * back — every other fact about the file is read from Drive server-side, so
 * nothing here has to be trusted.
 */
export async function pickDriveFiles(options: PickerOptions): Promise<string[]> {
  await loadGapi();

  const picker = window.google?.picker;
  if (!picker) throw new Error('Google loaded but the picker did not.');

  return new Promise<string[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);

    const built = new picker.PickerBuilder()
      .setDeveloperKey(options.developerKey)
      .setAppId(options.appId)
      .setOAuthToken(options.accessToken)
      .setTitle('Attach to this lecture')
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .addView(view)
      .addView(new picker.DocsUploadView())
      .setCallback((result) => {
        if (result.action === picker.Action.CANCEL) resolve([]);
        if (result.action !== picker.Action.PICKED) return;

        const ids = (result.docs ?? [])
          .map((doc) => doc.id)
          .filter((id): id is string => typeof id === 'string');
        resolve(ids);
      })
      .build();

    built.setVisible(true);
  });
}

/**
 * Upload one file into a Drive folder and return its new file id.
 *
 * Multipart in one request for anything small, resumable above Google's 5MB
 * cut-off. Both are documented REST calls; neither passes through this app.
 */
export async function uploadToDrive(input: {
  accessToken: string;
  folderId: string;
  file: File;
}): Promise<string> {
  const metadata = {
    name: input.file.name,
    parents: [input.folderId],
  };
  const contentType = input.file.type || 'application/octet-stream';

  if (input.file.size <= MULTIPART_MAX_BYTES) {
    const boundary = `recalc-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      input.file,
      `\r\n--${boundary}--\r\n`,
    ]);

    const response = await fetch(`${UPLOAD_ENDPOINT}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    return readUploadedId(response);
  }

  // Resumable, in a single chunk. Two requests: one to be told where to put it,
  // one to put it there.
  const start = await fetch(`${UPLOAD_ENDPOINT}?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': contentType,
      'x-upload-content-length': String(input.file.size),
    },
    body: JSON.stringify(metadata),
  });

  if (!start.ok) throw new Error(await uploadError(start));

  const location = start.headers.get('location');
  if (!location) {
    throw new Error('Google did not say where to upload that file. Try a smaller file.');
  }

  const response = await fetch(location, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: input.file,
  });
  return readUploadedId(response);
}

async function readUploadedId(response: Response): Promise<string> {
  if (!response.ok) throw new Error(await uploadError(response));

  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new Error('Drive accepted the file but did not name it.');
  return payload.id;
}

async function uploadError(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return 'Google Drive refused the upload. Reconnect Drive in settings.';
  }
  const body = await response.text().catch(() => '');
  return `Drive upload failed (${response.status}). ${body.slice(0, 140)}`.trim();
}
