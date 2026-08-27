// Public API of the gmail module. Import only from here.
//
// Owns `email_messages`. The connection it reads through — `google_accounts`,
// the refresh token, the scopes — belongs to modules/google.
export {
  getEmailAccounts,
  getMessage,
  getMessages,
  getRecentMessages,
  syncAccount,
  syncAllAccounts,
} from './service';
export type { AccountMail, SyncOptions } from './service';
export {
  GmailHistoryExpired,
  MAX_MESSAGES_PER_SYNC,
  SYNC_WINDOW_DAYS,
  SYNC_WINDOW_QUERY,
  emailMessageSchema,
  gmailMessageSchema,
  type EmailMessage,
  type GmailMessage,
  type SyncMode,
  type SyncOutcome,
  type SyncResult,
} from './schema';
// The two endpoint URLs, so a test can assert which one a sync used. The
// slice's whole claim is that the second sync never touches the first of them.
export { HISTORY_LIST_URL, MESSAGES_LIST_URL } from './gmail';
