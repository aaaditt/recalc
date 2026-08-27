import type { SupabaseClient } from '@supabase/supabase-js';

import { createBlock } from '@/modules/blocks';
import {
  GMAIL_READONLY_SCOPE,
  GoogleReconnectRequired,
  getGmailAccessToken,
  getGoogleAccountById,
  listGoogleAccounts,
  recordGmailSync,
  type GoogleFetch,
  type PublicGoogleAccount,
} from '@/modules/google';
import { ensureWorkspace } from '@/modules/workspaces';

import * as gmail from './gmail';
import * as repo from './repo';
import {
  GmailHistoryExpired,
  MAX_MESSAGES_PER_SYNC,
  MAX_PAGES_PER_SYNC,
  PAGE_SIZE,
  SYNC_WINDOW_DAYS,
  SYNC_WINDOW_QUERY,
  type EmailMessage,
  type GmailMessage,
  type SyncMode,
  type SyncResult,
} from './schema';

// Ingestion, and nothing else.
//
// **There is no model call anywhere in this module.** prompts/14-email-connect.md
// is unambiguous — "No AI in this slice. Zero interpretation." Reading a subject
// line and deciding what it means is slice 15's job, and the way to be sure this
// slice does not start doing it early is that `modules/agents` is not imported.
//
// The one claim this module has to defend:
//
//   A sync after the first one NEVER reads the mailbox. It asks Gmail what
//   changed since the stored `last_history_id` and fetches only that.
//
// `modules/gmail/incremental-sync.test.ts` fakes the HTTP layer and asserts it
// against the list endpoint's URL directly, so a regression to a full re-read
// fails the test rather than quietly costing a thousand requests a night.

export type SyncOptions = {
  /**
   * The `fetch` Google is reached on. Tests pass a fake; app code never does.
   * A global stub would break the Supabase client, which uses fetch too.
   */
  fetchImpl?: GoogleFetch;
  /** "Now", for a test that needs a fixed clock. */
  now?: Date;
};

// ---------------------------------------------------------------------------
// Reading what has already been synced
// ---------------------------------------------------------------------------

export type AccountMail = {
  account: PublicGoogleAccount;
  stored: number;
  recent: EmailMessage[];
};

/**
 * Every connected account, with what has been synced from it.
 *
 * The Drive-only accounts are in here too — the settings screen shows them so
 * "connect Gmail on this one" is a button next to the account it applies to,
 * rather than a second connect flow that might make a second row.
 */
export async function getEmailAccounts(
  db: SupabaseClient,
  userId: string,
  options: { recent?: number } = {}
): Promise<AccountMail[]> {
  const accounts = await listGoogleAccounts(db, userId);
  const limit = options.recent ?? 10;

  const result: AccountMail[] = [];
  for (const account of accounts) {
    const hasGmail = account.granted_scopes.includes(GMAIL_READONLY_SCOPE);
    result.push({
      account,
      stored: hasGmail ? await repo.countForAccount(db, account.id) : 0,
      recent: hasGmail ? await repo.recentForAccount(db, account.id, limit) : [],
    });
  }
  return result;
}

/**
 * The newest mail this user has, across every account they have connected.
 *
 * Slice 15 reads this to decide what to scan. Ownership is proved the only way
 * `email_messages` allows — through the connection it hangs off — rather than
 * by a `workspace_id` the table does not have (docs/DECISIONS.md, slice 14).
 */
export async function getRecentMessages(
  db: SupabaseClient,
  userId: string,
  limit: number
): Promise<EmailMessage[]> {
  const accounts = await listGoogleAccounts(db, userId);
  return repo.recentForAccounts(
    db,
    accounts.map((account) => account.id),
    limit
  );
}

/** One stored message, or null when it is not this user's. */
export async function getMessage(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<EmailMessage | null> {
  const message = await repo.findById(db, id);
  if (!message) return null;

  const accounts = await listGoogleAccounts(db, userId);
  return accounts.some((account) => account.id === message.google_account_id) ? message : null;
}

/** Several stored messages, filtered to the ones that are this user's. */
export async function getMessages(
  db: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<EmailMessage[]> {
  if (ids.length === 0) return [];
  const accounts = new Set((await listGoogleAccounts(db, userId)).map((account) => account.id));
  const messages = await repo.listByIds(db, ids);
  return messages.filter((message) => accounts.has(message.google_account_id));
}

// ---------------------------------------------------------------------------
// Syncing
// ---------------------------------------------------------------------------

/** Ids from the bounded 30-day window. Used by a first sync and by the fallback. */
async function idsInWindow(
  fetchImpl: GoogleFetch,
  accessToken: string
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | null = null;

  // Bounded twice over: at most MAX_PAGES_PER_SYNC requests, and at most
  // MAX_MESSAGES_PER_SYNC ids. Neither loop can run away if Gmail keeps
  // handing back page tokens.
  for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
    const result: gmail.ListPage = await gmail.listMessageIds(fetchImpl, accessToken, {
      query: SYNC_WINDOW_QUERY,
      maxResults: PAGE_SIZE,
      pageToken,
    });
    ids.push(...result.ids);
    if (ids.length >= MAX_MESSAGES_PER_SYNC) break;
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return ids.slice(0, MAX_MESSAGES_PER_SYNC);
}

/** Ids that Gmail says have arrived since the stored cursor. */
async function idsSinceCursor(
  fetchImpl: GoogleFetch,
  accessToken: string,
  startHistoryId: string
): Promise<{ ids: string[]; historyId: string | null }> {
  const ids: string[] = [];
  let pageToken: string | null = null;
  let historyId: string | null = null;

  for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
    const result: gmail.HistoryPage = await gmail.listHistory(fetchImpl, accessToken, {
      startHistoryId,
      maxResults: PAGE_SIZE,
      pageToken,
    });
    ids.push(...result.ids);
    historyId = result.historyId ?? historyId;
    if (ids.length >= MAX_MESSAGES_PER_SYNC) break;
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return { ids: ids.slice(0, MAX_MESSAGES_PER_SYNC), historyId };
}

/**
 * Store one message and give it an `email` block.
 *
 * The row goes in first. A block is only created when a row actually came back
 * — a message this account already had returns null and nothing else happens,
 * so re-syncing the same mail creates neither a duplicate row nor a second
 * block. That is the fifth thing the test checks.
 */
async function store(
  db: SupabaseClient,
  workspaceId: string,
  accountId: string,
  message: GmailMessage
): Promise<boolean> {
  const row = await repo.insertOne(db, {
    google_account_id: accountId,
    provider_msg_id: message.id,
    thread_id: message.threadId,
    sender: message.sender,
    subject: message.subject,
    snippet: message.snippet,
    received_at: message.receivedAt,
    block_id: null,
  });
  if (!row) return false;

  // An email is first-class: it is a block, in the same table as a paragraph
  // and a task, so slice 15 can hang a proposal off it and the recalc engine
  // can already treat it as a source. `text` is the subject because that is
  // what `plainTextOf` hashes and what a human would call this thing; the
  // sender and snippet ride along beside it for slice 15 to read.
  const block = await createBlock(db, {
    workspaceId,
    type: 'email',
    content: {
      text: message.subject ?? '(no subject)',
      sender: message.sender,
      snippet: message.snippet ?? '',
      thread_id: message.threadId,
      received_at: message.receivedAt,
    },
  });

  await repo.setBlockId(db, row.id, block.id);
  return true;
}

/**
 * Sync one connected Gmail account.
 *
 * Never throws for anything the user can fix. A dead refresh token, a missing
 * scope and a Google outage all come back as a `SyncResult` with an outcome and
 * a sentence — prompts/14-email-connect.md point 5: "Token failure is a normal
 * state, not a crash... Never throw a 500 at me for this."
 */
export async function syncAccount(
  db: SupabaseClient,
  userId: string,
  accountId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  const account = await getGoogleAccountById(db, userId, accountId);
  if (!account) {
    return {
      accountId,
      address: '',
      outcome: 'not_connected',
      mode: 'none',
      stored: 0,
      message: 'That Google account is not connected.',
    };
  }

  const base = { accountId: account.id, address: account.address };

  if (!account.granted_scopes.includes(GMAIL_READONLY_SCOPE)) {
    return {
      ...base,
      outcome: 'not_connected',
      mode: 'none',
      stored: 0,
      message: 'This account has not granted Gmail access yet.',
    };
  }

  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken(db, userId, accountId, options.fetchImpl);
  } catch (error) {
    if (error instanceof GoogleReconnectRequired) {
      // getGmailAccessToken has already set status = needs_reconnect. This is
      // a normal state: the token dies when the password changes, or after six
      // months unused.
      return {
        ...base,
        outcome: 'needs_reconnect',
        mode: 'none',
        stored: 0,
        message: 'Google is no longer accepting this connection. Reconnect it.',
      };
    }
    return {
      ...base,
      outcome: 'failed',
      mode: 'none',
      stored: 0,
      message: 'Could not reach Google. Try again in a minute.',
    };
  }

  const workspace = await ensureWorkspace(db, userId);

  let mode: SyncMode;
  let ids: string[];
  let nextCursor: string | null = null;

  try {
    if (!account.last_history_id) {
      // First sync: the bounded window. The mailbox's current position is read
      // BEFORE the listing, so mail arriving mid-sync is caught by the next
      // incremental pass rather than falling through the gap.
      mode = 'initial';
      nextCursor = await gmail.getCurrentHistoryId(fetchImpl, accessToken);
      ids = await idsInWindow(fetchImpl, accessToken);
    } else {
      try {
        mode = 'incremental';
        const changed = await idsSinceCursor(
          fetchImpl,
          accessToken,
          account.last_history_id
        );
        ids = changed.ids;
        nextCursor =
          changed.historyId ?? (await gmail.getCurrentHistoryId(fetchImpl, accessToken));
      } catch (error) {
        if (!(error instanceof GmailHistoryExpired)) throw error;
        // The cursor is older than Gmail keeps history for — a fortnight away
        // from the app looks exactly like this. Fall back to the SAME bounded
        // window a first sync uses, and say so, because a fallback nobody can
        // see is a fallback that quietly becomes the normal path.
        console.warn(
          `gmail: stored history id was too old for account ${accountId}; ` +
            `falling back to a bounded ${SYNC_WINDOW_DAYS}-day re-sync ` +
            `(at most ${MAX_MESSAGES_PER_SYNC} messages).`
        );
        mode = 'bounded_resync';
        nextCursor = await gmail.getCurrentHistoryId(fetchImpl, accessToken);
        ids = await idsInWindow(fetchImpl, accessToken);
      }
    }
  } catch {
    // Gmail said no in a way retrying might fix. Nothing about the message is
    // in this sentence, because nothing about a message is known yet.
    return {
      ...base,
      outcome: 'failed',
      mode: 'none',
      stored: 0,
      message: 'Gmail did not answer. Try again in a minute.',
    };
  }

  // The same message can appear twice in one history page (added, then
  // labelled). Ask for each id once.
  const unique = [...new Set(ids)];
  const known = await repo.existingProviderIds(db, accountId, unique);
  const fresh = unique.filter((id) => !known.has(id));

  let stored = 0;
  try {
    for (const id of fresh) {
      const message = await gmail.getMessage(fetchImpl, accessToken, id);
      if (await store(db, workspace.id, accountId, message)) stored += 1;
    }
  } catch {
    // Some messages landed. Deliberately do NOT move the cursor: the next run
    // asks for the same range again, and the rows already written are skipped
    // by the unique index. Losing a message is worse than fetching one twice.
    return {
      ...base,
      outcome: 'failed',
      mode,
      stored,
      message: 'Gmail stopped answering part way through. The next sync will resume.',
    };
  }

  if (nextCursor) {
    await recordGmailSync(db, userId, accountId, {
      lastHistoryId: nextCursor,
      syncedAt: now.toISOString(),
    });
  }

  return { ...base, outcome: 'ok', mode, stored, message: null };
}

/**
 * Sync every account that has granted Gmail access.
 *
 * One bad account never stops the others: each is its own `SyncResult`, and
 * `syncAccount` does not throw.
 */
export async function syncAllAccounts(
  db: SupabaseClient,
  userId: string,
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  const accounts = await listGoogleAccounts(db, userId);
  const results: SyncResult[] = [];

  for (const account of accounts) {
    if (!account.granted_scopes.includes(GMAIL_READONLY_SCOPE)) continue;
    results.push(await syncAccount(db, userId, account.id, options));
  }

  return results;
}
