import { z } from 'zod';

// One Google account, shared by Drive (slice 09) and Gmail (slice 14).
// docs/DECISIONS.md, "One google_accounts table shared by Drive and Gmail":
// they are the same account with different granted scopes, and two tables would
// mean two connect flows and two refresh tokens for one account.

// ---------------------------------------------------------------------------
// Scopes
//
// docs/SCHEMA.md, "Google scopes — and why Drive is easier than Gmail":
//   drive.file is NON-SENSITIVE and grants access only to files the user picks
//   through the Google Picker or that this app itself created. It never sees
//   the rest of the Drive.
//
// CLAUDE.md's slice spec is blunt about it: "drive.file only. Never
// drive.readonly or drive." Those are restricted scopes, they grant the whole
// Drive, and nothing here needs them. The constant below is the only place a
// scope string is written, and modules/google/oauth.test.ts asserts the
// forbidden two never appear in a URL this app builds.
// ---------------------------------------------------------------------------

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Every scope this slice asks for. Exactly one. */
export const DRIVE_SCOPES = [DRIVE_FILE_SCOPE] as const;

/**
 * Scopes that must never be requested, at any point, by any slice.
 *
 * `drive.readonly` and `drive` are restricted: they trigger a Google security
 * assessment and they grant access to every file the user owns.
 */
export const FORBIDDEN_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  // Slice 14. Everything Gmail offers beyond reading is on this list, because
  // prompts/14-email-connect.md's first constraint is "Read-only. The app never
  // sends, replies to, deletes, or labels anything" — and the way to keep that
  // promise is to be unable to. `gmail.modify` covers labelling and archiving;
  // `mail.google.com` covers deleting; `gmail.send` and `gmail.compose` cover
  // sending. None of them is ever requested.
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://mail.google.com/',
] as const;

/**
 * Read a message, and nothing else.
 *
 * Restricted, in Google's classification (docs/SCHEMA.md, "Google scopes — and
 * why Drive is easier than Gmail"): fine under 100 users, but the consent
 * screen shows an "unverified app" warning that has to be clicked through.
 * That is the price of reading mail at all, and it is why Drive shipped first.
 */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** Every scope slice 14 asks for. Exactly one. */
export const GMAIL_SCOPES = [GMAIL_READONLY_SCOPE] as const;

// ---------------------------------------------------------------------------

export const googleAccountStatusSchema = z.enum(['ok', 'needs_reconnect']);

export const googleAccountSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  address: z.string(),
  // AES-256-GCM ciphertext from lib/crypto.ts. Never leaves the server, and
  // never leaves this module — `PublicGoogleAccount` is what a screen sees.
  refresh_token_enc: z.string(),
  granted_scopes: z.array(z.string()),
  last_history_id: z.string().nullable(),
  synced_at: z.string().nullable(),
  status: googleAccountStatusSchema,
  created_at: z.string(),
});

/**
 * What a page is allowed to know about the connection.
 *
 * CLAUDE.md's Never rule 4: no OAuth token in anything a component can see.
 * The screens need the address, the status and which features were granted —
 * and nothing else, so nothing else is in this shape.
 */
export const publicGoogleAccountSchema = googleAccountSchema
  .omit({ refresh_token_enc: true, user_id: true })
  .extend({ canUseDrive: z.boolean(), canUseGmail: z.boolean() });

/** One file's metadata as Drive v3 reports it. */
export const driveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string().nullable().default(null),
  /** Drive reports size as a string, and folders have none at all. */
  size: z.string().nullable().default(null),
  webViewLink: z.string().nullable().default(null),
  thumbnailLink: z.string().nullable().default(null),
  trashed: z.boolean().nullable().default(null),
});

export type GoogleAccount = z.infer<typeof googleAccountSchema>;
export type PublicGoogleAccount = z.infer<typeof publicGoogleAccountSchema>;
export type GoogleAccountStatus = z.infer<typeof googleAccountStatusSchema>;
export type DriveFile = z.infer<typeof driveFileSchema>;

/**
 * Google said no, and the app cannot fix it by trying again.
 *
 * Thrown when a refresh token has been revoked or has expired — the user
 * removed the app in their Google account settings, or changed their password.
 * The account row is marked `needs_reconnect` and the screens say so in one
 * plain sentence rather than showing a stack trace.
 */
export class GoogleReconnectRequired extends Error {
  constructor(message = 'Google Drive needs reconnecting.') {
    super(message);
    this.name = 'GoogleReconnectRequired';
  }
}

/** Drive says that file is not there — deleted, or never shared with this app. */
export class DriveFileGone extends Error {
  constructor(message = 'That file is no longer in your Drive.') {
    super(message);
    this.name = 'DriveFileGone';
  }
}
