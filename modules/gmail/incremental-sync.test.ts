import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { encryptSecret } from '@/lib/crypto';
import {
  HISTORY_LIST_URL,
  MESSAGES_LIST_URL,
  SYNC_WINDOW_QUERY,
  syncAccount,
} from '@/modules/gmail';
import { GMAIL_READONLY_SCOPE, type GoogleFetch } from '@/modules/google';

// THE slice-14 invariant:
//
//   Sync is genuinely incremental. After the first one it NEVER reads the
//   mailbox again — it asks Gmail what changed since the stored
//   `last_history_id` and fetches only that.
//
// A test that only counted stored rows would pass just as happily against a
// sync that re-listed thirty days of mail every hour and threw away what it
// already had: the rows would be identical and the bill would not. So the
// control case here is the ENDPOINT. `messages.list` is the call that reads the
// mailbox; the second sync is asserted never to touch it. If sync ever degrades
// into a full re-read, that assertion is what fails.
//
// Same setup as slices 11, 12 and 13: the real Supabase project with the
// service-role key, because `email_messages`, its unique index and the blocks
// beside it are what is being proved. A throwaway auth user is created and
// deleted, which cascades to the google_accounts row, its email_messages and
// the workspace's blocks.
//
// The ONE thing faked is Google's network — a `fetch` passed in, not a global
// stub, because the Supabase client in this very test uses `fetch` too. It
// answers four endpoints: the OAuth token endpoint, Gmail's profile,
// `messages.list`/`messages.get`, and `history.list`.
//
// There is no Google account and no consent screen on this machine, and none is
// needed: everything below runs from the stored refresh token onwards.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || !process.env.ENCRYPTION_KEY) {
  throw new Error(
    'incremental-sync.test.ts needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ' +
      'and ENCRYPTION_KEY in .env.local, and migrations applied (npm run db:push). See SETUP.md.'
  );
}

// ---------------------------------------------------------------------------
// A Gmail that does not exist
// ---------------------------------------------------------------------------

type FakeMessage = {
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
};

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

class FakeGoogle {
  /** Every URL asked for since the last `reset()`. The evidence. */
  urls: string[] = [];

  /** Google refuses to refresh the token: what a revoked grant looks like. */
  tokenFails = false;
  /** Gmail rejects the stored cursor as too old. */
  historyExpired = false;
  /** `history.list` keeps handing back page tokens, to test the page cap. */
  historyEndless = false;
  /** `messages.list` keeps handing back page tokens, to test the page cap. */
  listEndless = false;

  historyId = '1000';
  /** Ids `messages.list` reports, one page at a time. */
  windowPages: string[][] = [];
  /** Ids `history.list` reports as added since the cursor. */
  historyIds: string[] = [];
  messages = new Map<string, FakeMessage>();

  reset() {
    this.urls = [];
  }

  /** Which URLs were `messages.list` — the call that reads the mailbox. */
  listCalls(): string[] {
    return this.urls.filter((u) => new URL(u).pathname === '/gmail/v1/users/me/messages');
  }

  historyCalls(): string[] {
    return this.urls.filter((u) => u.startsWith(HISTORY_LIST_URL));
  }

  /** Which message ids were fetched individually. */
  fetchedMessageIds(): string[] {
    return this.urls
      .map((u) => new URL(u))
      .filter((u) => u.pathname.startsWith('/gmail/v1/users/me/messages/'))
      .map((u) => decodeURIComponent(u.pathname.split('/').pop() ?? ''));
  }

  add(id: string, message: Partial<FakeMessage> = {}): void {
    this.messages.set(id, {
      threadId: `thread-${id}`,
      from: `Dr Ada Byron <ada-${id}@uni.example>`,
      subject: `Lecture ${id}`,
      snippet: `The seminar for ${id} has moved.`,
      receivedAt: new Date('2026-08-01T09:00:00Z'),
      ...message,
    });
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  readonly fetch: GoogleFetch = async (target) => {
    const asString = typeof target === 'string' ? target : String(target);
    this.urls.push(asString);

    if (asString === TOKEN_ENDPOINT) {
      if (this.tokenFails) {
        // Exactly what Google sends for a revoked or expired refresh token.
        return this.json({ error: 'invalid_grant' }, 400);
      }
      return this.json({
        access_token: 'fake-access-token',
        expires_in: 3600,
        scope: GMAIL_READONLY_SCOPE,
        token_type: 'Bearer',
      });
    }

    if (asString === PROFILE_ENDPOINT) {
      return this.json({ emailAddress: 'ada@uni.example', historyId: this.historyId });
    }

    const parsed = new URL(asString);

    if (asString.startsWith(HISTORY_LIST_URL)) {
      if (this.historyExpired) {
        // Gmail's own answer when startHistoryId is older than it keeps.
        return this.json({ error: { code: 404, message: 'Requested entity was not found.' } }, 404);
      }
      const page = Number(parsed.searchParams.get('pageToken') ?? '0');
      return this.json({
        history: this.historyIds.map((id) => ({
          messagesAdded: [{ message: { id, threadId: `thread-${id}` } }],
        })),
        historyId: this.historyId,
        ...(this.historyEndless ? { nextPageToken: String(page + 1) } : {}),
      });
    }

    if (parsed.pathname === '/gmail/v1/users/me/messages') {
      const page = Number(parsed.searchParams.get('pageToken') ?? '0');
      const ids = this.windowPages[page] ?? [];
      const more = this.listEndless || page + 1 < this.windowPages.length;
      return this.json({
        messages: ids.map((id) => ({ id, threadId: `thread-${id}` })),
        ...(more ? { nextPageToken: String(page + 1) } : {}),
      });
    }

    if (parsed.pathname.startsWith('/gmail/v1/users/me/messages/')) {
      const id = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
      const message = this.messages.get(id);
      if (!message) return this.json({ error: { code: 404 } }, 404);
      return this.json({
        id,
        threadId: message.threadId,
        snippet: message.snippet,
        internalDate: String(message.receivedAt.getTime()),
        payload: {
          headers: [
            { name: 'From', value: message.from },
            { name: 'Subject', value: message.subject },
            { name: 'Date', value: message.receivedAt.toUTCString() },
          ],
        },
      });
    }

    throw new Error(
      `the fake Google was asked for something it does not serve: ${parsed.pathname}`
    );
  };
}

// ---------------------------------------------------------------------------

describe('gmail sync is incremental and never re-reads the mailbox', () => {
  let db: SupabaseClient;
  let userId: string;
  let google: FakeGoogle;

  /** A connected Gmail account with a readable (fake) refresh token. */
  async function makeAccount(options: {
    address: string;
    scopes?: string[];
    refreshTokenEnc?: string;
  }): Promise<string> {
    const { data, error } = await db
      .from('google_accounts')
      .insert({
        user_id: userId,
        address: options.address,
        refresh_token_enc:
          options.refreshTokenEnc ?? encryptSecret(`refresh-${randomUUID()}`),
        granted_scopes: options.scopes ?? [GMAIL_READONLY_SCOPE],
        status: 'ok',
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not make a test account: ${error.message}`);
    return data.id as string;
  }

  async function storedMessages(accountId: string) {
    const { data, error } = await db
      .from('email_messages')
      .select('*')
      .eq('google_account_id', accountId)
      .order('received_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async function accountRow(accountId: string) {
    const { data, error } = await db
      .from('google_accounts')
      .select('*')
      .eq('id', accountId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const sync = (accountId: string) =>
    syncAccount(db, userId, accountId, { fetchImpl: google.fetch });

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const created = await db.auth.admin.createUser({
      email: `gmail-sync-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (created.error) {
      throw new Error(`could not create test user: ${created.error.message}`);
    }
    userId = created.data.user.id;
  });

  afterAll(async () => {
    // Cascades to google_accounts, email_messages, the workspace and its blocks.
    if (userId) await db.auth.admin.deleteUser(userId);
  });

  // -------------------------------------------------------------------------
  // (a) and (b): the first sync is bounded; the second one does not re-read.
  // -------------------------------------------------------------------------

  describe('the first sync, then the second', () => {
    let accountId: string;

    beforeAll(async () => {
      google = new FakeGoogle();
      google.historyId = '5000';
      google.windowPages = [['m1', 'm2']];
      google.add('m1');
      google.add('m2');
      accountId = await makeAccount({ address: `first-${randomUUID()}@uni.example` });
    });

    it('pulls a bounded 30-day window and stores the messages', async () => {
      google.reset();
      const result = await sync(accountId);

      expect(result.outcome).toBe('ok');
      expect(result.mode).toBe('initial');
      expect(result.stored).toBe(2);

      // Bounded: the query is the 30-day window and maxResults is always set.
      const list = google.listCalls();
      expect(list).toHaveLength(1);
      const listUrl = new URL(list[0]);
      expect(listUrl.searchParams.get('q')).toBe(SYNC_WINDOW_QUERY);
      expect(Number(listUrl.searchParams.get('maxResults'))).toBeGreaterThan(0);

      const rows = await storedMessages(accountId);
      expect(rows.map((row) => row.provider_msg_id).sort()).toEqual(['m1', 'm2']);
      expect(rows[0].sender).toContain('ada-m1@uni.example');
      expect(rows[0].thread_id).toBe('thread-m1');
      expect(rows[0].snippet).toBe('The seminar for m1 has moved.');
    });

    it('gives every message an email block', async () => {
      const rows = await storedMessages(accountId);
      expect(rows.every((row) => row.block_id !== null)).toBe(true);

      const { data, error } = await db
        .from('blocks')
        .select('id, type, content')
        .in(
          'id',
          rows.map((row) => row.block_id as string)
        );
      if (error) throw new Error(error.message);

      expect(data).toHaveLength(2);
      expect(data?.every((block) => block.type === 'email')).toBe(true);
      const subjects = (data ?? [])
        .map((block) => (block.content as { text?: string }).text)
        .sort();
      expect(subjects).toEqual(['Lecture m1', 'Lecture m2']);
    });

    it('stores the cursor Gmail gave it', async () => {
      const account = await accountRow(accountId);
      expect(account.last_history_id).toBe('5000');
      expect(account.synced_at).not.toBeNull();
      expect(account.status).toBe('ok');
    });

    // THE control case.
    it('never calls the mailbox listing again once it has a cursor', async () => {
      google.historyIds = ['m3'];
      google.historyId = '5200';
      google.add('m3');

      google.reset();
      const result = await sync(accountId);

      expect(result.outcome).toBe('ok');
      expect(result.mode).toBe('incremental');
      expect(result.stored).toBe(1);

      // The whole slice, in one assertion: the endpoint that reads the mailbox
      // was not touched.
      expect(google.listCalls()).toEqual([]);
      expect(google.urls.some((u) => u.startsWith(`${MESSAGES_LIST_URL}?`))).toBe(false);

      // And it asked history.list from exactly the stored cursor.
      const history = google.historyCalls();
      expect(history).toHaveLength(1);
      expect(new URL(history[0]).searchParams.get('startHistoryId')).toBe('5000');

      // Only the changed message was fetched. m1 and m2 were not re-read.
      expect(google.fetchedMessageIds()).toEqual(['m3']);

      const rows = await storedMessages(accountId);
      expect(rows.map((row) => row.provider_msg_id).sort()).toEqual(['m1', 'm2', 'm3']);
      expect((await accountRow(accountId)).last_history_id).toBe('5200');
    });

    // -----------------------------------------------------------------------
    // (e) the same message twice
    // -----------------------------------------------------------------------

    it('re-syncing the same message duplicates neither the row nor the block', async () => {
      const before = await storedMessages(accountId);

      // Gmail reports m3 again — a label change replays it in history.
      google.historyIds = ['m3'];
      google.historyId = '5300';
      google.reset();

      const result = await sync(accountId);
      expect(result.outcome).toBe('ok');
      expect(result.stored).toBe(0);

      // Already stored, so it was not even fetched from Gmail a second time.
      expect(google.fetchedMessageIds()).toEqual([]);

      const after = await storedMessages(accountId);
      expect(after).toHaveLength(before.length);
      expect(after.filter((row) => row.provider_msg_id === 'm3')).toHaveLength(1);

      const { count, error } = await db
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('id', before.find((row) => row.provider_msg_id === 'm3')?.block_id ?? '');
      if (error) throw new Error(error.message);
      expect(count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // (c) a cursor Gmail no longer recognises
  // -------------------------------------------------------------------------

  describe('a history id that is too old', () => {
    it('falls back to a BOUNDED re-sync, and says so', async () => {
      google = new FakeGoogle();
      google.historyExpired = true;
      google.historyId = '9000';
      // Gmail would keep paging forever. The sync must not.
      google.listEndless = true;
      google.windowPages = [['x1', 'x2']];
      google.add('x1', { subject: 'Tutorial moved to Friday' });
      google.add('x2');

      const accountId = await makeAccount({
        address: `expired-${randomUUID()}@uni.example`,
      });
      await db
        .from('google_accounts')
        .update({ last_history_id: '1' })
        .eq('id', accountId);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      google.reset();
      const result = await sync(accountId);
      const warnings = warn.mock.calls.map((call) => String(call[0]));
      warn.mockRestore();

      expect(result.outcome).toBe('ok');
      expect(result.mode).toBe('bounded_resync');

      // It tried history first, was refused, and fell back.
      expect(google.historyCalls()).toHaveLength(1);

      // BOUNDED: a fixed number of pages, not "until Gmail runs out", and the
      // 30-day query on every one of them.
      const list = google.listCalls();
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(4);
      for (const call of list) {
        expect(new URL(call).searchParams.get('q')).toBe(SYNC_WINDOW_QUERY);
      }

      // Logged, so a fallback that becomes the normal path is visible.
      expect(warnings.some((line) => line.includes('bounded'))).toBe(true);
      // And logged without a word of anyone's mail in it.
      expect(warnings.join(' ')).not.toContain('Tutorial moved to Friday');
      expect(warnings.join(' ')).not.toContain('Dr Ada Byron');

      // The cursor moved forward, so the next run is incremental again.
      expect((await accountRow(accountId)).last_history_id).toBe('9000');
    });

    it('caps an endless history feed at the same page limit', async () => {
      google = new FakeGoogle();
      google.historyEndless = true;
      google.historyId = '9100';
      google.historyIds = ['y1'];
      google.add('y1');

      const accountId = await makeAccount({
        address: `endless-${randomUUID()}@uni.example`,
      });
      await db
        .from('google_accounts')
        .update({ last_history_id: '90' })
        .eq('id', accountId);

      google.reset();
      const result = await sync(accountId);

      expect(result.outcome).toBe('ok');
      expect(google.listCalls()).toEqual([]);
      expect(google.historyCalls().length).toBeLessThanOrEqual(4);
    });
  });

  // -------------------------------------------------------------------------
  // (d) a dead refresh token is a normal state, not a crash
  // -------------------------------------------------------------------------

  describe('a refresh token Google will not accept', () => {
    it('marks the account needs_reconnect and does not throw', async () => {
      google = new FakeGoogle();
      google.tokenFails = true;

      const accountId = await makeAccount({
        address: `revoked-${randomUUID()}@uni.example`,
      });

      google.reset();
      const result = await sync(accountId);

      expect(result.outcome).toBe('needs_reconnect');
      expect(result.stored).toBe(0);
      expect(result.message).toBeTruthy();

      const account = await accountRow(accountId);
      expect(account.status).toBe('needs_reconnect');

      // It gave up at the token endpoint. Gmail was never asked for anything.
      expect(google.listCalls()).toEqual([]);
      expect(google.historyCalls()).toEqual([]);
    });

    it('does the same for a token that cannot be decrypted at all', async () => {
      google = new FakeGoogle();

      const accountId = await makeAccount({
        address: `unreadable-${randomUUID()}@uni.example`,
        refreshTokenEnc: 'v1.not.a.ciphertext',
      });

      const result = await sync(accountId);

      expect(result.outcome).toBe('needs_reconnect');
      expect((await accountRow(accountId)).status).toBe('needs_reconnect');
    });

    it('says so quietly when Gmail was never granted on the account', async () => {
      google = new FakeGoogle();

      const accountId = await makeAccount({
        address: `drive-only-${randomUUID()}@uni.example`,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });

      const result = await sync(accountId);

      expect(result.outcome).toBe('not_connected');
      expect(result.stored).toBe(0);
      // The Drive connection is untouched — this is not a failure of it.
      expect((await accountRow(accountId)).status).toBe('ok');
    });
  });
});
