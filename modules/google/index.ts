// Public API of the google module. Import only from here.
//
// Owns `google_accounts` — one row per connected Google account, shared by
// Drive (slice 09) and Gmail (slice 14).
export {
  googleRedirectUri,
  startGoogleConnect,
  completeGoogleConnect,
  disconnectGoogleAccount,
  getGoogleAccount,
  getDriveAccessToken,
  getDriveFile,
  getPickerToken,
  ensureRecalcFolder,
  openDriveFile,
  openDriveThumbnail,
  requestedScopes,
} from './service';
export { ROOT_FOLDER_NAME } from './drive';
export { authorizeUrl } from './oauth';
export {
  DRIVE_FILE_SCOPE,
  DRIVE_SCOPES,
  FORBIDDEN_SCOPES,
  DriveFileGone,
  GoogleReconnectRequired,
  driveFileSchema,
  googleAccountSchema,
  publicGoogleAccountSchema,
  type DriveFile,
  type GoogleAccount,
  type GoogleAccountStatus,
  type PublicGoogleAccount,
} from './schema';
