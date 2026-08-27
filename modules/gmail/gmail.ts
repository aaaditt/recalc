import type { GoogleFetch } from '@/modules/google';

import { GmailHistoryExpired, gmailMessageSchema, type GmailMessage } from './schema';

// Gmail's REST API, over plain fetch.
//
// No `googleapis` SDK, for the reason slice 09 already recorded in
// docs/DECISIONS.md and modules/google/oauth.ts repeats: it is a very large
// dependency for four HTTP calls, and every one of these is a documented REST
// endpoint. Slice 14 makes exactly four kinds of call and every one of them is
// a GET.
//
// **Read-only, structurally.** There is no POST, PUT, PATCH or DELETE in this
// file, and the only scope the app ever asks for is gmail.readonly
// (modules/google/schema.ts lists the rest as forbidden). The app cannot send,
// reply, archive, label or delete because there is no code here that could.
//
// **Nothing in this file logs.** A subject or a snippet passes through
// `getMessage` and goes straight into the return value; no error message built
// here contains anything but an HTTP status and the name of the call. That is
// prompts/14-email-connect.md's third constraint, kept by having nowhere for a
// message to leak out of.

const BASE = 'https://gmail.googleapis.com/gmail/v1';

/** The endpoint that reads the mailbox. An incremental sync must not touch it. */
export const MESSAGES_LIST_URL = `${BASE}/users/me/messages`;
/** The endpoint that reads only what changed. */
export const HISTORY_LIST_URL = `${BASE}/users/me/history`;

async function getJson<T>(
  fetchImpl: GoogleFetch,
  url: string,
  accessToken: string,
  call: string
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    // Deliberately the status and the call name, nothing else. Gmail's error
    // bodies are not supposed to carry message content, and "not supposed to"
    // is not a good enough reason to put one in a log line.
    throw new Error(`gmail ${call}: ${response.status}`);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// The mailbox cursor
// ---------------------------------------------------------------------------

/**
 * The mailbox's current `historyId`.
 *
 * Read *before* a full listing rather than after, so anything that arrives
 * while the listing is running is picked up by the next incremental pass
 * instead of falling into the gap between the two.
 */
export async function getCurrentHistoryId(
  fetchImpl: GoogleFetch,
  accessToken: string
): Promise<string> {
  const payload = await getJson<{ historyId?: unknown }>(
    fetchImpl,
    `${BASE}/users/me/profile`,
    accessToken,
    'profile'
  );
  const historyId = payload.historyId;
  if (typeof historyId !== 'string' || historyId === '') {
    throw new Error('gmail profile: no historyId');
  }
  return historyId;
}

// ---------------------------------------------------------------------------
// Listing — bounded, always
// ---------------------------------------------------------------------------

export type ListPage = { ids: string[]; nextPageToken: string | null };

/**
 * One page of message ids matching a Gmail search query.
 *
 * `q` is always a bounded query — `newer_than:30d` — and `maxResults` is always
 * set. There is no code path in this module that lists the mailbox without
 * both. The caller also caps the number of pages, so the worst case of the
 * fallback in `service.ts` is a known number of requests, not "the mailbox".
 */
export async function listMessageIds(
  fetchImpl: GoogleFetch,
  accessToken: string,
  options: { query: string; maxResults: number; pageToken?: string | null }
): Promise<ListPage> {
  const url = new URL(MESSAGES_LIST_URL);
  url.searchParams.set('q', options.query);
  url.searchParams.set('maxResults', String(options.maxResults));
  if (options.pageToken) url.searchParams.set('pageToken', options.pageToken);

  const payload = await getJson<{
    messages?: { id?: unknown }[];
    nextPageToken?: unknown;
  }>(fetchImpl, url.toString(), accessToken, 'messages.list');

  return {
    ids: (payload.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => typeof id === 'string'),
    nextPageToken:
      typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null,
  };
}

// ---------------------------------------------------------------------------
// History — the incremental path
// ---------------------------------------------------------------------------

export type HistoryPage = {
  ids: string[];
  nextPageToken: string | null;
  /** Where the mailbox is now. Absent when Gmail did not say. */
  historyId: string | null;
};

/**
 * One page of `history.list` from a stored cursor.
 *
 * `historyTypes=messageAdded` is the only type asked for: this app reads mail,
 * it does not mirror labels or deletions, and asking for the others would mean
 * fetching changes it has nothing to do with.
 *
 * A 404 means the cursor is older than Gmail's history window (about a week for
 * a quiet mailbox). That is normal after a holiday, not a bug — it becomes
 * `GmailHistoryExpired`, and the service falls back to the same bounded window
 * a first sync uses.
 */
export async function listHistory(
  fetchImpl: GoogleFetch,
  accessToken: string,
  options: { startHistoryId: string; maxResults: number; pageToken?: string | null }
): Promise<HistoryPage> {
  const url = new URL(HISTORY_LIST_URL);
  url.searchParams.set('startHistoryId', options.startHistoryId);
  url.searchParams.set('historyTypes', 'messageAdded');
  url.searchParams.set('maxResults', String(options.maxResults));
  if (options.pageToken) url.searchParams.set('pageToken', options.pageToken);

  const response = await fetchImpl(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404 || response.status === 410) {
    throw new GmailHistoryExpired();
  }
  if (!response.ok) {
    throw new Error(`gmail history.list: ${response.status}`);
  }

  const payload = (await response.json()) as {
    history?: { messagesAdded?: { message?: { id?: unknown } }[] }[];
    nextPageToken?: unknown;
    historyId?: unknown;
  };

  const ids: string[] = [];
  for (const record of payload.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      const id = added.message?.id;
      if (typeof id === 'string') ids.push(id);
    }
  }

  return {
    ids,
    nextPageToken:
      typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null,
    historyId: typeof payload.historyId === 'string' ? payload.historyId : null,
  };
}

// ---------------------------------------------------------------------------
// One message — metadata only
// ---------------------------------------------------------------------------

function headerOf(
  headers: { name?: unknown; value?: unknown }[],
  name: string
): string | null {
  const match = headers.find(
    (header) =>
      typeof header.name === 'string' &&
      header.name.toLowerCase() === name.toLowerCase()
  );
  return typeof match?.value === 'string' ? match.value : null;
}

/**
 * One message, as `format=metadata`.
 *
 * That format is the promise in prompts/14-email-connect.md point 4 made
 * mechanical: Gmail does not send the body at all, so there is nothing to
 * accidentally store. Three headers are asked for and three are read.
 */
export async function getMessage(
  fetchImpl: GoogleFetch,
  accessToken: string,
  id: string
): Promise<GmailMessage> {
  const url = new URL(`${MESSAGES_LIST_URL}/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'metadata');
  url.searchParams.append('metadataHeaders', 'From');
  url.searchParams.append('metadataHeaders', 'Subject');
  url.searchParams.append('metadataHeaders', 'Date');

  const payload = await getJson<{
    id?: unknown;
    threadId?: unknown;
    snippet?: unknown;
    internalDate?: unknown;
    payload?: { headers?: { name?: unknown; value?: unknown }[] };
  }>(fetchImpl, url.toString(), accessToken, 'messages.get');

  const headers = payload.payload?.headers ?? [];

  // internalDate is Gmail's own "when this arrived", in milliseconds as a
  // string. It is preferred over the Date: header, which the sender writes and
  // can therefore be wrong or absent.
  const internal =
    typeof payload.internalDate === 'string' ? Number(payload.internalDate) : NaN;
  const receivedAt = Number.isFinite(internal)
    ? new Date(internal).toISOString()
    : new Date().toISOString();

  return gmailMessageSchema.parse({
    id: typeof payload.id === 'string' ? payload.id : id,
    threadId: typeof payload.threadId === 'string' ? payload.threadId : id,
    sender: headerOf(headers, 'From') ?? 'unknown sender',
    subject: headerOf(headers, 'Subject'),
    snippet: typeof payload.snippet === 'string' ? payload.snippet : null,
    receivedAt,
  });
}
