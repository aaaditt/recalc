import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptSecret, encryptSecret } from '@/lib/crypto';

import * as drive from './drive';
import * as oauth from './oauth';
import * as repo from './repo';
import {
  DRIVE_FILE_SCOPE,
  DRIVE_SCOPES,
  GoogleReconnectRequired,
  publicGoogleAccountSchema,
  type DriveFile,
  type GoogleAccount,
  type PublicGoogleAccount,
} from './schema';

// The Google connection, and everything that needs a live token to do its job.
//
// The credentials are read from process.env directly rather than through
// lib/env.server.ts, which imports `server-only` — whose default export throws
// outside a React Server Component, so a module that imported it could not be
// tested (docs/DECISIONS.md, "Repos and services take the Supabase client as
// their first argument", and "`scripts/seed-check.ts` builds its own Supabase
// client"). lib/env.server.ts still *validates* all three, so a missing value
// fails at boot rather than at the moment someone presses Connect.

function credentials(redirectUri: string): oauth.GoogleCredentials {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set. See docs/GOOGLE_SETUP.md.'
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/** The redirect URI this app expects, for an origin. Registered in Google Cloud. */
export function googleRedirectUri(origin: string): string {
  return new URL('/api/auth/google/callback', origin).toString();
}

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

/**
 * Where to send the browser, and the one-time value the callback must echo.
 *
 * The caller puts `state` in an httpOnly cookie and compares it on the way
 * back; without that, any page on the internet could walk this user through
 * connecting an attacker's Google account.
 */
export function startGoogleConnect(redirectUri: string): { url: string; state: string } {
  const state = randomBytes(32).toString('base64url');
  return { url: oauth.authorizeUrl(credentials(redirectUri), state), state };
}

/**
 * Finish the handshake: swap the code for tokens and store the connection.
 *
 * The refresh token is encrypted before it is written, with the key from the
 * environment (docs/DECISIONS.md, "Encryption key in env, not in the
 * database"). The address is asked of Drive itself rather than of an extra
 * `email` scope — `drive.file` alone can answer it.
 */
export async function completeGoogleConnect(
  db: SupabaseClient,
  userId: string,
  input: { code: string; redirectUri: string }
): Promise<PublicGoogleAccount> {
  const tokens = await oauth.exchangeCode(credentials(input.redirectUri), input.code);

  if (!tokens.refreshToken) {
    throw new Error(
      'Google did not return a refresh token. Remove Recalc from your Google account ' +
        'permissions and connect again.'
    );
  }
  // Google may grant less than was asked for — the consent screen has a
  // checkbox per scope. Believe the response, never the request.
  if (!tokens.scopes.includes(DRIVE_FILE_SCOPE)) {
    throw new Error('Drive access was not granted. Tick the Drive box and try again.');
  }

  const address = await drive.getAccountAddress(tokens.accessToken);

  const account = await repo.upsert(db, {
    user_id: userId,
    address,
    refresh_token_enc: encryptSecret(tokens.refreshToken),
    granted_scopes: tokens.scopes,
    status: 'ok',
  });

  return toPublic(account);
}

/**
 * Forget the connection, and ask Google to forget it too.
 *
 * The `files` rows are deliberately left alone: they are references to files
 * that are still sitting in the user's Drive, and this app never deletes a
 * Drive file (prompts/09-drive.md point 5). Reconnecting brings them back.
 */
export async function disconnectGoogleAccount(
  db: SupabaseClient,
  userId: string
): Promise<void> {
  const account = await repo.find(db, userId);
  if (!account) return;

  try {
    await oauth.revokeToken(decryptSecret(account.refresh_token_enc));
  } catch {
    // An unreadable or already-revoked token must not stop the row going away,
    // or "Disconnect" becomes a button with no effect and no explanation.
  }

  await repo.remove(db, userId, account.id);
}

// ---------------------------------------------------------------------------
// Reading the connection
// ---------------------------------------------------------------------------

function toPublic(account: GoogleAccount): PublicGoogleAccount {
  return publicGoogleAccountSchema.parse({
    id: account.id,
    address: account.address,
    granted_scopes: account.granted_scopes,
    last_history_id: account.last_history_id,
    synced_at: account.synced_at,
    status: account.status,
    created_at: account.created_at,
    canUseDrive:
      account.status === 'ok' && account.granted_scopes.includes(DRIVE_FILE_SCOPE),
  });
}

/**
 * The connected Google account, or null.
 *
 * Never the refresh token: `PublicGoogleAccount` has no field for it, so a page
 * cannot leak what it was never handed (CLAUDE.md's Never rule 4).
 */
export async function getGoogleAccount(
  db: SupabaseClient,
  userId: string
): Promise<PublicGoogleAccount | null> {
  const account = await repo.find(db, userId);
  return account ? toPublic(account) : null;
}

/** The scopes this slice asks for, for the settings screen to show. */
export function requestedScopes(): readonly string[] {
  return DRIVE_SCOPES;
}

// ---------------------------------------------------------------------------
// Using the connection
// ---------------------------------------------------------------------------

/**
 * A fresh access token, good for about an hour.
 *
 * Minted per operation rather than cached: an access token in a cache is a
 * credential with a lifetime nobody is tracking, and Google's refresh endpoint
 * is one round trip. A revoked grant is caught here — the row is marked
 * `needs_reconnect` so every screen can say so in one plain sentence instead of
 * failing differently in five places.
 */
export async function getDriveAccessToken(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const account = await repo.find(db, userId);
  if (!account) throw new GoogleReconnectRequired('No Google account is connected.');
  if (!account.granted_scopes.includes(DRIVE_FILE_SCOPE)) {
    throw new GoogleReconnectRequired('This Google account did not grant Drive access.');
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(account.refresh_token_enc);
  } catch {
    // A changed ENCRYPTION_KEY, or a corrupted row. Unrecoverable, and
    // reconnecting is the only fix — so say exactly that.
    await repo.setStatus(db, account.id, 'needs_reconnect');
    throw new GoogleReconnectRequired(
      'The stored Google token could not be read. Connect Drive again.'
    );
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.');
    }

    const tokens = await oauth.refreshAccessToken({ clientId, clientSecret }, refreshToken);
    if (account.status !== 'ok') await repo.setStatus(db, account.id, 'ok');
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof GoogleReconnectRequired) {
      await repo.setStatus(db, account.id, 'needs_reconnect');
    }
    throw error;
  }
}

/**
 * The id of `Recalc/<course code>/` in the user's Drive, creating it on first
 * use. `null` course code puts the file in `Recalc/` itself.
 *
 * The caller must already have proved the course belongs to the workspace —
 * this takes a code, not an id, precisely so it cannot be the place that
 * ownership check is forgotten.
 */
export async function ensureRecalcFolder(
  db: SupabaseClient,
  userId: string,
  courseCode: string | null
): Promise<{ folderId: string; path: string }> {
  const accessToken = await getDriveAccessToken(db, userId);

  const segments = [drive.ROOT_FOLDER_NAME];
  // Slashes in a folder name are what Drive would read as a second folder, and
  // a course code should not contain one anyway.
  const safeCode = courseCode?.trim().replace(/[\\/]/g, '-') ?? '';
  if (safeCode !== '') segments.push(safeCode);

  return {
    folderId: await drive.ensureFolderPath(accessToken, segments),
    path: `${segments.join('/')}/`,
  };
}

/** One Drive file's metadata, asked of Google rather than believed from a form. */
export async function getDriveFile(
  db: SupabaseClient,
  userId: string,
  fileId: string
): Promise<DriveFile> {
  return drive.getFile(await getDriveAccessToken(db, userId), fileId);
}

/** The file's bytes, for the in-place viewer. Streamed, never stored. */
export async function openDriveFile(
  db: SupabaseClient,
  userId: string,
  fileId: string
): Promise<Response> {
  return drive.downloadFile(await getDriveAccessToken(db, userId), fileId);
}

/**
 * The file's thumbnail, or null when there is not one.
 *
 * The stored `thumbnail_link` goes stale, so it is re-read from Drive first.
 * Null all the way down is fine: the tile draws itself without a picture.
 */
export async function openDriveThumbnail(
  db: SupabaseClient,
  userId: string,
  fileId: string
): Promise<Response | null> {
  const accessToken = await getDriveAccessToken(db, userId);
  const file = await drive.getFile(accessToken, fileId);
  if (!file.thumbnailLink) return null;
  return drive.downloadThumbnail(accessToken, file.thumbnailLink);
}

/**
 * A short-lived access token, for the Google Picker and for uploading straight
 * from the browser to Google.
 *
 * This is the one place a Google token is deliberately handed to the client,
 * and it is what makes `drive.file` work at all: the Picker is the thing that
 * grants this app access to a file, and it can only run in the browser
 * (docs/DECISIONS.md). It is minted at the moment of the click, expires in
 * about an hour, is scoped to `drive.file` alone, and is never written to a
 * file, a cookie or `localStorage`. The refresh token and the client secret
 * never leave the server.
 */
export async function getPickerToken(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  return getDriveAccessToken(db, userId);
}
