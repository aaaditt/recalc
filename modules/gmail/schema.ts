import { z } from 'zod';

// modules/gmail owns `email_messages` and nothing else. The connection itself —
// `google_accounts`, the refresh token, the scopes — belongs to modules/google,
// which is where the token comes from.

// ---------------------------------------------------------------------------
// The bounds. Every one of these is a number this slice refuses to exceed.
// ---------------------------------------------------------------------------

/** prompts/14-email-connect.md point 3: "first sync pulls the last 30 days". */
export const SYNC_WINDOW_DAYS = 30;

/** The Gmail search that expresses that window. The only query this app sends. */
export const SYNC_WINDOW_QUERY = `newer_than:${SYNC_WINDOW_DAYS}d`;

/** Ids per listing request. Gmail's own maximum for this endpoint is 500. */
export const PAGE_SIZE = 100;

/**
 * The hard ceiling on a single sync.
 *
 * A bounded re-sync is the fallback when the stored history id is too old, and
 * "bounded" has to mean a number or it means nothing. Four pages of a hundred:
 * past this, the sync stops and says so, and the next run picks up from the new
 * cursor rather than starting again from the beginning.
 */
export const MAX_PAGES_PER_SYNC = 4;
export const MAX_MESSAGES_PER_SYNC = PAGE_SIZE * MAX_PAGES_PER_SYNC;

// ---------------------------------------------------------------------------

/** One message as Gmail's `format=metadata` describes it. No body, ever. */
export const gmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  sender: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  /** ISO 8601, from Gmail's `internalDate`. */
  receivedAt: z.string(),
});

export const emailMessageSchema = z.object({
  id: z.uuid(),
  google_account_id: z.uuid(),
  provider_msg_id: z.string(),
  thread_id: z.string(),
  sender: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  received_at: z.string(),
  block_id: z.uuid().nullable(),
  created_at: z.string(),
});

/** Why a sync stopped. Every one of these is a normal thing to see. */
export const syncOutcomeSchema = z.enum([
  /** Nothing was wrong. `stored` may still be 0. */
  'ok',
  /** The refresh token is dead. The account is now `needs_reconnect`. */
  'needs_reconnect',
  /** This account has no Gmail scope. Nothing was attempted. */
  'not_connected',
  /** Google or the network said no in a way that retrying might fix. */
  'failed',
]);

/** How a sync got its list of message ids. Reported so the screen can say. */
export const syncModeSchema = z.enum([
  /** No stored cursor: the bounded 30-day window. */
  'initial',
  /** A stored cursor: history.list, and the mailbox was never listed. */
  'incremental',
  /** The cursor was too old: the bounded 30-day window again, and logged. */
  'bounded_resync',
  /** Nothing ran. */
  'none',
]);

export type GmailMessage = z.infer<typeof gmailMessageSchema>;
export type EmailMessage = z.infer<typeof emailMessageSchema>;
export type SyncOutcome = z.infer<typeof syncOutcomeSchema>;
export type SyncMode = z.infer<typeof syncModeSchema>;

export type SyncResult = {
  accountId: string;
  address: string;
  outcome: SyncOutcome;
  mode: SyncMode;
  /** New messages written on this run. A re-sync of the same mail stores 0. */
  stored: number;
  /**
   * A sentence safe to put on a screen. Never contains anything from a message
   * — a sender, a subject and a snippet are all off limits here.
   */
  message: string | null;
};

/**
 * Gmail will not accept that `startHistoryId`: it is older than the history it
 * keeps (roughly a week for a quiet mailbox).
 *
 * Not a bug and not an error the user should ever see. It is what a fortnight
 * away from the app looks like, and the answer is one bounded re-sync.
 */
export class GmailHistoryExpired extends Error {
  constructor(message = 'That sync cursor is older than Gmail keeps history for.') {
    super(message);
    this.name = 'GmailHistoryExpired';
  }
}
